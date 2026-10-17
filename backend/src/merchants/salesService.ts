import { randomUUID } from "node:crypto";
import { planAllocations } from "../domain/allocation.js";
import { describeError } from "../openPayments/errors.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { fromMinorUnits, toAmount, type Amount } from "../shared/money.js";
import type { SalePaymentChanges, Store } from "../storage/store.js";
import type { MerchantService } from "./merchantService.js";
import type {
  MerchantRecord,
  SaleRecord,
  SettlementItem,
  SettlementItemStatus,
} from "./types.js";

type PublicPayment = Awaited<ReturnType<PaymentFlows["getPayment"]>>;

export interface SalesOptions {
  /** Base URL of the web client, used for the customer's pay link. */
  frontendUrl: string;
  /**
   * The wallet app's send screen (the Interledger test wallet's /send). Given an incoming payment
   * as `merchantWA`, it fills in what is left of its amount and locks its description, and lets the signed-in
   * customer pick their own account and wallet address. Without it, the QR is the incoming payment
   * URL itself.
   */
  walletSendUrl?: string;
  now?: () => Date;
}

/** The sweeper only looks at sales from the last day. */
const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A sale is a one-off Open Payments payment from the customer's wallet to the merchant's:
 * payment request → customer consent → execution → completion (the four steps the demo shows).
 * Once paid, the sale settles: each rule's share leaves the merchant's wallet under the
 * daily-capped grant (ADR 0004), exactly once (ADR 0006).
 */
export class SalesService {
  private readonly now: () => Date;
  private sweeping = false;

  constructor(
    private readonly flows: PaymentFlows,
    private readonly merchants: MerchantService,
    private readonly store: Store,
    private readonly options: SalesOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /**
   * The merchant types the amount and the till shows `payUrl` as a QR code. Each sale is an Open
   * Payments payment request: an incoming payment on the merchant's wallet for exactly that amount.
   * The QR opens the customer's wallet app on it (the shop fixed and the amount filled in,
   * and the signed-in customer only confirms), and MiPlante settles the sale once it completes.
   * `checkoutUrl` is MiPlante's checkout, the full consent flow, which pays the same request.
   */
  async createSale(
    merchantId: string,
    input: { amount: string; description?: string },
  ) {
    const merchant = await this.merchants.require(merchantId);
    const amount = toAmount(input.amount, merchant.asset);
    const request = await this.flows.requestPayment({
      receiver: merchant.wallet,
      amount: fromMinorUnits(amount.value, amount.assetScale),
      description: saleDescription(merchant.name, input.description),
    });
    const timestamp = this.timestamp();
    const sale = await this.store.saveSale({
      id: randomUUID(),
      merchantId,
      amount,
      description: input.description,
      status: "open",
      paymentId: request.id,
      settlement: { status: "pending", items: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const view = await this.view(sale);
    return { sale: view, payUrl: view.payUrl, checkoutUrl: view.checkoutUrl };
  }

  /** The customer enters their wallet; returns the URL where they approve the payment. */
  async pay(saleId: string, input: { customerWallet: string }) {
    const sale = await this.require(saleId);
    if (sale.status !== "open" && sale.status !== "failed") {
      throw new AppError("Esta venta ya se está pagando o ya fue pagada", 409);
    }
    const merchant = await this.merchants.require(sale.merchantId);
    // Pay the sale's own payment request while it can still be paid, so the QR and the checkout
    // share one destination and the sale can only be paid once.
    const current = sale.paymentId
      ? await this.store.getPayment(sale.paymentId)
      : undefined;
    const reusable = current && current.status !== "failed" && current.status !== "rejected";
    const { payment, redirectUrl } = await this.flows.startPayment({
      sender: input.customerWallet,
      receiver: merchant.wallet,
      amount: fromMinorUnits(sale.amount.value, sale.amount.assetScale),
      description: saleDescription(merchant.name, sale.description),
      returnTo: `/pay?sale=${sale.id}`,
      incoming: reusable
        ? { url: current.incomingPaymentUrl, accessToken: current.incomingToken }
        : undefined,
    });
    const updated = await this.store.transitionSale(
      sale.id,
      ["open", "failed"],
      {
        status: "awaiting-consent",
        customer: payment.sender,
        paymentId: payment.id,
        error: undefined,
      },
      this.timestamp(),
    );
    // Two customers paying at once: the first one wins, the other consent is never used.
    if (!updated) {
      throw new AppError("Esta venta ya se está pagando o ya fue pagada", 409);
    }
    return { sale: await this.view(updated), redirectUrl };
  }

  /** Reads the payment's progress from Open Payments. Polled by both screens. */
  async refresh(saleId: string) {
    let sale = await this.require(saleId);
    if (
      sale.paymentId &&
      (sale.status === "open" ||
        sale.status === "awaiting-consent" ||
        sale.status === "processing")
    ) {
      const payment = await this.flows.refreshPayment(sale.paymentId);
      sale =
        (await this.store.transitionSale(
          sale.id,
          [sale.status],
          this.statusFrom(payment),
          this.timestamp(),
        )) ?? (await this.require(saleId));
    }
    if (sale.status === "paid" && sale.settlement.status === "pending") {
      await this.settle(sale.id);
    } else if (
      sale.settlement.status === "done" &&
      sale.settlement.items.some((item) => item.status === "processing")
    ) {
      // Only once settle() has finished writing, so this never overwrites a running settlement.
      await this.refreshSettlement(sale.id);
    }
    return this.view(await this.require(saleId));
  }

  /**
   * Splits a paid sale by the merchant's rules. The settlement is claimed in the database
   * (pending → running, one atomic update) before any money moves, so concurrent polls, the
   * sweeper or another server instance can never split the same sale twice (ADR 0006).
   */
  async settle(saleId: string): Promise<void> {
    if (!(await this.store.claimSettlement(saleId, this.timestamp()))) return;
    let sale = await this.require(saleId);

    const merchant = await this.merchants.require(sale.merchantId);
    if ((await this.flows.findMandate(merchant.mandateId)).status !== "active") {
      await this.update(sale, {
        settlement: {
          status: "skipped",
          reason: "La autorización diaria del comercio no está activa",
          items: [],
          kept: sale.amount,
          settledAt: this.timestamp(),
        },
      });
      return;
    }

    const plan = planAllocations(
      sale.amount,
      merchant.rules,
      await this.remainingCap(merchant),
    );
    // The rules are charged in parallel: their amounts already fit the remaining daily cap
    // (and the wallet rejects any excess anyway), so the split takes one charge, not one per rule.
    const items: (SettlementItem | undefined)[] = plan.allocations.map(
      () => undefined,
    );
    // Progress is written as each charge finishes, one write at a time, so a crash never hides
    // money that already moved.
    let progress = Promise.resolve();
    const persistProgress = () => {
      progress = progress.then(async () => {
        sale = await this.update(await this.require(saleId), {
          settlement: {
            ...sale.settlement,
            status: "running",
            items: items.filter((item) => item !== undefined),
          },
        });
      });
      return progress;
    };
    await Promise.all(
      plan.allocations.map(async (allocation, index) => {
        const rule = merchant.rules.find((r) => r.id === allocation.ruleId)!;
        const base = {
          ruleId: rule.id,
          label: rule.label,
          kind: rule.kind,
          destination: rule.destination,
          amount: allocation.amount,
          capped: allocation.capped,
        };
        if (allocation.amount.value === "0") {
          items[index] = { ...base, status: "skipped" };
          return;
        }
        try {
          const payment = await this.flows.chargeMandate(merchant.mandateId, {
            receiver: rule.destination,
            amount: fromMinorUnits(
              allocation.amount.value,
              allocation.amount.assetScale,
            ),
            amountType: "send",
            description: `MiPlante · ${rule.label}`,
          });
          items[index] = {
            ...base,
            status: itemStatus(payment.status),
            paymentId: payment.id,
          };
          await this.merchants.recordRepayment(
            merchant.id,
            rule.id,
            allocation.amount,
          );
        } catch (error) {
          // The debt balance stays untouched when the repayment could not be sent.
          items[index] = {
            ...base,
            status: "failed",
            error: describeError(error),
          };
        }
        await persistProgress();
      }),
    );
    await progress;

    const done = items.filter((item) => item !== undefined);
    const sent = done
      .filter((item) => item.status !== "failed" && item.status !== "skipped")
      .reduce((total, item) => total + BigInt(item.amount.value), 0n);
    await this.update(await this.require(saleId), {
      settlement: {
        status: "done",
        items: done,
        kept: {
          ...sale.amount,
          value: (BigInt(sale.amount.value) - sent).toString(),
        },
        settledAt: this.timestamp(),
      },
    });
  }

  /** Background pass (ADR 0006): moves sales forward even when nobody has their page open. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const since = new Date(this.now().getTime() - SWEEP_WINDOW_MS);
      const sales = await this.store.listSales({
        createdSince: since.toISOString(),
      });
      for (const sale of sales) {
        if (!needsWork(sale)) continue;
        try {
          await this.refresh(sale.id);
        } catch (error) {
          console.warn(`[sweeper] venta ${sale.id}: ${describeError(error)}`);
        }
      }
    } finally {
      this.sweeping = false;
    }
  }

  /** Starts the sweeper; returns a function that stops it. */
  startSweeper(intervalMs = 3_000): () => void {
    const timer = setInterval(() => void this.sweep(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  /**
   * The wallet app's send screen on the sale's incoming payment: it reads the amount and the
   * description from it (the amount stays editable; a smaller payment leaves the sale pending),
   * and preselects the signed-in customer's wallet. Without
   * `walletSendUrl`, the incoming payment URL itself, which any Open Payments wallet can pay.
   */
  private qrUrl(incomingPaymentUrl: string): string {
    if (!this.options.walletSendUrl) return incomingPaymentUrl;
    const url = new URL(this.options.walletSendUrl);
    url.searchParams.set("merchantWA", incomingPaymentUrl);
    return url.toString();
  }

  /** MiPlante's own checkout, where the customer types their wallet name. */
  payUrl(saleId: string): string {
    return `${this.options.frontendUrl}/pay?sale=${saleId}`;
  }

  async require(id: string): Promise<SaleRecord> {
    const sale = await this.store.getSale(id);
    if (!sale) throw new NotFoundError(`No existe la venta ${id}`);
    return sale;
  }

  async view(sale: SaleRecord) {
    const [payment, merchant] = await Promise.all([
      sale.paymentId ? this.flows.getPayment(sale.paymentId) : undefined,
      this.store.getMerchant(sale.merchantId),
    ]);
    return {
      id: sale.id,
      merchantId: sale.merchantId,
      merchantName: merchant?.name,
      amount: sale.amount,
      description: sale.description,
      status: sale.status,
      customer: sale.customer,
      error: sale.error,
      payment: payment && {
        status: payment.status,
        steps: payment.steps,
        debitAmount: payment.debitAmount,
        receivedAmount: payment.receivedAmount,
      },
      // The QR: the wallet app on the sale's incoming payment while it can still be paid. After a
      // partial payment it asks for exactly what is left.
      payUrl:
        payment && sale.status !== "failed"
          ? this.qrUrl(payment.incomingPaymentUrl)
          : this.payUrl(sale.id),
      /** What is still missing after a partial payment; absent until money arrives or once paid. */
      pending: pendingAmount(sale, payment?.receivedAmount),
      checkoutUrl: this.payUrl(sale.id),
      settlement: sale.settlement,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      paidAt: sale.paidAt,
    };
  }

  private update(
    sale: SaleRecord,
    changes: Partial<SaleRecord>,
  ): Promise<SaleRecord> {
    return this.store.saveSale({
      ...sale,
      ...changes,
      updatedAt: this.timestamp(),
    });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  /** What is left of today's cap, from the grant's spent amount. Undefined if unknown. */
  private async remainingCap(
    merchant: MerchantRecord,
  ): Promise<Amount | undefined> {
    const spent = (await this.flows.getMandate(merchant.mandateId)).spent
      ?.debitAmount;
    const cap = merchant.dailyCap;
    if (
      !spent ||
      spent.assetCode !== cap.assetCode ||
      spent.assetScale !== cap.assetScale
    ) {
      return undefined;
    }
    const left = BigInt(cap.value) - BigInt(spent.value);
    return { ...cap, value: (left > 0n ? left : 0n).toString() };
  }

  private async refreshSettlement(saleId: string): Promise<void> {
    const sale = await this.require(saleId);
    const items = await Promise.all(
      sale.settlement.items.map(async (item) => {
        if (item.status !== "processing" || !item.paymentId) return item;
        const payment = await this.flows.refreshPayment(item.paymentId);
        return {
          ...item,
          status: itemStatus(payment.status),
          error: payment.error,
        };
      }),
    );
    await this.update(await this.require(saleId), {
      settlement: { ...sale.settlement, items },
    });
  }

  private statusFrom(payment: PublicPayment): SalePaymentChanges {
    switch (payment.status) {
      case "completed":
        return { status: "paid", paidAt: this.timestamp(), error: undefined };
      case "failed":
      case "rejected":
        return {
          status: "failed",
          error: payment.error ?? "El pago no se completó",
        };
      case "processing":
        return { status: "processing" };
      default:
        // Nobody has paid the sale's payment request yet: the sale is still open.
        return payment.kind === "payment-request"
          ? { status: "open" }
          : { status: "awaiting-consent" };
    }
  }
}

function itemStatus(paymentStatus: string): SettlementItemStatus {
  if (paymentStatus === "completed") return "completed";
  if (paymentStatus === "failed" || paymentStatus === "rejected")
    return "failed";
  return "processing";
}

function needsWork(sale: SaleRecord): boolean {
  return (
    (sale.status === "open" && Boolean(sale.paymentId)) ||
    sale.status === "awaiting-consent" ||
    sale.status === "processing" ||
    (sale.status === "paid" && sale.settlement.status === "pending") ||
    sale.settlement.items.some((item) => item.status === "processing")
  );
}

function saleDescription(merchantName: string, description?: string): string {
  return description ? `${merchantName} · ${description}` : merchantName;
}

/** A payer who sent less than the sale left this much to pay. */
function pendingAmount(
  sale: SaleRecord,
  received: Amount | undefined,
): Amount | undefined {
  if (sale.status !== "processing" || !received) return undefined;
  if (
    received.assetCode !== sale.amount.assetCode ||
    received.assetScale !== sale.amount.assetScale
  ) {
    return undefined;
  }
  const left = BigInt(sale.amount.value) - BigInt(received.value);
  if (BigInt(received.value) <= 0n || left <= 0n) return undefined;
  return { ...sale.amount, value: left.toString() };
}
