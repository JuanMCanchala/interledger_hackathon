import { randomUUID } from "node:crypto";
import { planAllocations } from "../domain/allocation.js";
import { describeError } from "../openPayments/errors.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { fromMinorUnits, toAmount, type Amount } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantService } from "./merchantService.js";
import type {
  MerchantRecord,
  SaleRecord,
  SettlementItem,
  SettlementItemStatus,
} from "./types.js";

type PublicPayment = ReturnType<PaymentFlows["getPayment"]>;

export interface SalesOptions {
  /** Base URL of the web client, used for the customer's pay link. */
  frontendUrl: string;
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
  private readonly settling = new Set<string>();
  private sweeping = false;

  constructor(
    private readonly flows: PaymentFlows,
    private readonly merchants: MerchantService,
    private readonly store: Store,
    private readonly options: SalesOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** The merchant types the amount; the till shows `payUrl` as a QR code. */
  createSale(
    merchantId: string,
    input: { amount: string; description?: string },
  ) {
    const merchant = this.merchants.require(merchantId);
    const timestamp = this.timestamp();
    const sale = this.store.saveSale({
      id: randomUUID(),
      merchantId,
      amount: toAmount(input.amount, merchant.asset),
      description: input.description,
      status: "open",
      settlement: { status: "pending", items: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return {
      sale: this.view(sale),
      payUrl: this.payUrl(sale.id),
    };
  }

  /** The customer enters their wallet; returns the URL where they approve the payment. */
  async pay(saleId: string, input: { customerWallet: string }) {
    const sale = this.require(saleId);
    if (sale.status !== "open" && sale.status !== "failed") {
      throw new AppError("Esta venta ya se está pagando o ya fue pagada", 409);
    }
    const merchant = this.merchants.require(sale.merchantId);
    const { payment, redirectUrl } = await this.flows.startPayment({
      sender: input.customerWallet,
      receiver: merchant.wallet,
      amount: fromMinorUnits(sale.amount.value, sale.amount.assetScale),
      description: sale.description
        ? `${merchant.name} · ${sale.description}`
        : merchant.name,
      returnTo: `/pay.html?sale=${sale.id}`,
    });
    const updated = this.update(sale, {
      status: "awaiting-consent",
      customer: payment.sender,
      paymentId: payment.id,
      error: undefined,
    });
    return { sale: this.view(updated), redirectUrl };
  }

  /** Reads the payment's progress from Open Payments. Polled by both screens. */
  async refresh(saleId: string) {
    let sale = this.require(saleId);
    if (
      sale.paymentId &&
      (sale.status === "awaiting-consent" || sale.status === "processing")
    ) {
      const payment = await this.flows.refreshPayment(sale.paymentId);
      sale = this.update(sale, this.statusFrom(payment));
    }
    if (sale.status === "paid" && sale.settlement.status === "pending") {
      await this.settle(sale.id);
    } else if (
      sale.settlement.items.some((item) => item.status === "processing")
    ) {
      await this.refreshSettlement(sale.id);
    }
    return this.view(this.require(saleId));
  }

  /**
   * Splits a paid sale by the merchant's rules. The state moves to "running" before any money moves
   * and an in-process lock stops concurrent polls from settling the same sale twice.
   */
  async settle(saleId: string): Promise<void> {
    if (this.settling.has(saleId)) return;
    this.settling.add(saleId);
    try {
      let sale = this.require(saleId);
      if (sale.status !== "paid" || sale.settlement.status !== "pending")
        return;
      sale = this.update(sale, {
        settlement: { ...sale.settlement, status: "running" },
      });

      const merchant = this.merchants.require(sale.merchantId);
      if (this.flows.findMandate(merchant.mandateId).status !== "active") {
        this.update(sale, {
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
      const items: SettlementItem[] = [];
      for (const allocation of plan.allocations) {
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
          items.push({ ...base, status: "skipped" });
          continue;
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
          items.push({
            ...base,
            status: itemStatus(payment.status),
            paymentId: payment.id,
          });
          this.merchants.recordRepayment(
            merchant.id,
            rule.id,
            allocation.amount,
          );
        } catch (error) {
          // The debt balance stays untouched when the repayment could not be sent.
          items.push({
            ...base,
            status: "failed",
            error: describeError(error),
          });
        }
        // Persist progress after every item, so a crash never hides money that already moved.
        sale = this.update(this.require(saleId), {
          settlement: {
            ...sale.settlement,
            status: "running",
            items: [...items],
          },
        });
      }

      const sent = items
        .filter((item) => item.status !== "failed" && item.status !== "skipped")
        .reduce((total, item) => total + BigInt(item.amount.value), 0n);
      this.update(this.require(saleId), {
        settlement: {
          status: "done",
          items,
          kept: {
            ...sale.amount,
            value: (BigInt(sale.amount.value) - sent).toString(),
          },
          settledAt: this.timestamp(),
        },
      });
    } finally {
      this.settling.delete(saleId);
    }
  }

  /** Background pass (ADR 0006): moves sales forward even when nobody has their page open. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const since = this.now().getTime() - SWEEP_WINDOW_MS;
      for (const sale of this.store.listSales()) {
        if (Date.parse(sale.createdAt) < since || !needsWork(sale)) continue;
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

  /** Link the customer opens from the QR code. */
  payUrl(saleId: string): string {
    return `${this.options.frontendUrl}/pay.html?sale=${saleId}`;
  }

  require(id: string): SaleRecord {
    const sale = this.store.getSale(id);
    if (!sale) throw new NotFoundError(`No existe la venta ${id}`);
    return sale;
  }

  view(sale: SaleRecord) {
    const payment = sale.paymentId
      ? this.flows.getPayment(sale.paymentId)
      : undefined;
    return {
      id: sale.id,
      merchantId: sale.merchantId,
      merchantName: this.store.getMerchant(sale.merchantId)?.name,
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
      payUrl: this.payUrl(sale.id),
      settlement: sale.settlement,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      paidAt: sale.paidAt,
    };
  }

  private update(sale: SaleRecord, changes: Partial<SaleRecord>): SaleRecord {
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
    const sale = this.require(saleId);
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
    this.update(this.require(saleId), {
      settlement: { ...sale.settlement, items },
    });
  }

  private statusFrom(payment: PublicPayment): Partial<SaleRecord> {
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
        return { status: "awaiting-consent" };
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
    sale.status === "awaiting-consent" ||
    sale.status === "processing" ||
    (sale.status === "paid" && sale.settlement.status === "pending") ||
    sale.settlement.items.some((item) => item.status === "processing")
  );
}
