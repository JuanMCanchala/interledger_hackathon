import { randomUUID } from "node:crypto";
import { bogotaDay } from "../domain/calendar.js";
import { describeError } from "../openPayments/errors.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError } from "../shared/errors.js";
import { fromMinorUnits, toAmount, type Amount } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantService } from "./merchantService.js";
import type { PayoutService } from "./payoutService.js";
import type { SalesService } from "./salesService.js";
import type { SaleRecord, SettlementItem } from "./types.js";

const MAX_SALE_MAJOR = 100_000_000n;

/** What a deposit did: which shares it released, and what is still waiting for cash. */
export interface DepositResult {
  deposited: Amount;
  /** Savings shares sent now through Open Payments. */
  sent: Amount;
  /** Debt shares now set aside in the wallet for their due day. */
  reserved: Amount;
  /** Shares of cash sales still waiting for a deposit. */
  stillInCash: Amount;
  /** Deposited money not yet matched to a share: it covers the next ones. */
  credit: Amount;
  /** Creditors paid right away, because their due day had already come. */
  paidNow: string[];
  /** Shares that could not be sent; the money stays in the wallet. */
  failed: string[];
}

/**
 * Cash sales (ADR 0019). A cash sale counts as a sale and is split by the shop's rules, but its
 * shares stay in cash: Open Payments cannot move money that is in the drawer. When the shopkeeper
 * deposits cash into the wallet, the deposit releases the oldest shares first: savings leave at
 * once, debts are set aside for their due day (or paid now if it has come). Only the shares need
 * depositing: what the shop keeps can stay in the drawer.
 */
export class CashService {
  private readonly now: () => Date;
  private readonly depositing = new Map<string, Promise<unknown>>();

  constructor(
    private readonly flows: PaymentFlows,
    private readonly merchants: MerchantService,
    private readonly sales: SalesService,
    private readonly payouts: PayoutService,
    private readonly store: Store,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Records a sale paid in cash, already paid, and splits it with its shares held in cash. */
  async recordSale(merchantId: string, input: { amount: string; description?: string }) {
    const merchant = await this.merchants.require(merchantId);
    const amount = toAmount(input.amount, merchant.asset);
    if (BigInt(amount.value) > MAX_SALE_MAJOR * 10n ** BigInt(merchant.asset.assetScale)) {
      throw new AppError("El monto es demasiado grande para una venta");
    }
    const timestamp = this.now().toISOString();
    const sale = await this.store.saveSale({
      id: randomUUID(),
      merchantId,
      amount,
      description: input.description,
      method: "cash",
      status: "paid",
      paidAt: timestamp,
      settlement: { status: "pending", items: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.sales.settle(sale.id);
    return { sale: await this.sales.view((await this.store.getSale(sale.id))!) };
  }

  /** The shares of cash sales waiting for a deposit, per rule, and their total (after subtracting any partial cash credit already deposited). */
  async inCash(merchantId: string): Promise<{ total: bigint; byRule: Record<string, bigint> }> {
    const merchant = await this.merchants.require(merchantId);
    let remainingCredit = BigInt(merchant.cashCredit?.value ?? "0");
    const byRule: Record<string, bigint> = {};
    let total = 0n;
    const sales = (await this.store.listSales({ merchantId }))
      .filter((sale) => sale.settlement.items.some((item) => item.status === "cash"))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const sale of sales) {
      for (const item of sale.settlement.items) {
        if (item.status !== "cash") continue;
        let amount = BigInt(item.amount.value);
        if (remainingCredit > 0n) {
          const covered = remainingCredit >= amount ? amount : remainingCredit;
          amount -= covered;
          remainingCredit -= covered;
        }
        if (amount <= 0n) continue;
        byRule[item.ruleId] = (byRule[item.ruleId] ?? 0n) + amount;
        total += amount;
      }
    }
    return { total, byRule };
  }

  /**
   * The shopkeeper deposited `amount` of cash into the shop's wallet. It releases the oldest shares
   * held in cash that it covers, whole; what is left over is kept as credit for the next ones. One
   * deposit at a time per shop, so a share is never released twice.
   */
  async deposit(merchantId: string, input: { amount: string }): Promise<DepositResult> {
    const previous = this.depositing.get(merchantId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => this.release(merchantId, input.amount));
    this.depositing.set(merchantId, current);
    return current;
  }

  private async release(merchantId: string, value: string): Promise<DepositResult> {
    const merchant = await this.merchants.require(merchantId);
    const deposited = toAmount(value, merchant.asset);
    if (BigInt(deposited.value) <= 0n) throw new AppError("Escribe cuánto consignaste");
    if ((await this.flows.findMandate(merchant.mandateId)).status !== "active") {
      throw new AppError(
        "Tu autorización mensual no está activa: autorízala para que salgan los repartos del efectivo",
        409,
      );
    }
    const money = (v: bigint): Amount => ({ ...merchant.asset, value: v.toString() });
    let credit = BigInt(merchant.cashCredit?.value ?? "0") + BigInt(deposited.value);
    let sent = 0n;
    let reserved = 0n;
    const failed: string[] = [];
    const releasedDebts = new Set<string>();

    // Oldest first: the cash that came in first is the cash being deposited.
    const sales = (await this.store.listSales({ merchantId }))
      .filter((sale) => sale.settlement.items.some((item) => item.status === "cash"))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const sale of sales) {
      const items: SettlementItem[] = [];
      let changed = false;
      for (const item of sale.settlement.items) {
        const share = BigInt(item.amount.value);
        if (item.status !== "cash" || share > credit) {
          items.push(item);
          continue;
        }
        credit -= share;
        changed = true;
        if (item.kind === "debt") {
          items.push({ ...item, status: "reserved" });
          reserved += share;
          releasedDebts.add(item.ruleId);
          continue;
        }
        try {
          const payment = await this.flows.chargeMandate(merchant.mandateId, {
            receiver: item.destination,
            amount: fromMinorUnits(item.amount.value, item.amount.assetScale),
            amountType: "send",
            description: `MiPlante · ${item.label} (efectivo)`,
          });
          const status = payment.status === "completed" ? "completed" : "processing";
          items.push({ ...item, status, paymentId: payment.id });
          if (status === "completed") {
            await this.merchants.recordRepayment(merchant.id, item.ruleId, item.amount);
          }
          sent += share;
        } catch (error) {
          // Nothing left the wallet: the share goes back to what the shop kept.
          items.push({ ...item, status: "failed", error: describeError(error) });
          failed.push(item.label);
        }
      }
      if (changed) await this.saveItems(sale, items);
    }

    await this.store.updateMerchant({
      ...(await this.merchants.require(merchantId)),
      cashCredit: money(credit),
      updatedAt: this.now().toISOString(),
    });

    // A creditor already paid this month's due day gets the released cash now, not next month.
    // Before the due day (or if the scheduler has not run yet) the due-day payment takes it.
    const month = bogotaDay(this.now()).slice(0, 7);
    const payouts = await this.store.listPayouts(merchantId);
    const paidNow: string[] = [];
    for (const ruleId of releasedDebts) {
      const rule = merchant.rules.find((r) => r.id === ruleId);
      const dueDayDone = payouts.some(
        (p) => p.ruleId === ruleId && p.month === month && p.reason === "due-date",
      );
      if (!rule || !dueDayDone) continue;
      try {
        await this.payouts.pay(merchantId, { ruleId, reason: "manual" });
        paidNow.push(rule.label);
      } catch (error) {
        console.warn(`[cash] no se pudo pagar ${rule.label} tras la consignación: ${describeError(error)}`);
      }
    }

    return {
      deposited,
      sent: money(sent),
      reserved: money(reserved),
      stillInCash: money((await this.inCash(merchantId)).total),
      credit: money(credit),
      paidNow,
      failed,
    };
  }

  private async saveItems(sale: SaleRecord, items: SettlementItem[]): Promise<void> {
    const fresh = (await this.store.getSale(sale.id)) ?? sale;
    const moved = items
      .filter((item) => item.status !== "failed" && item.status !== "skipped")
      .reduce((total, item) => total + BigInt(item.amount.value), 0n);
    await this.store.saveSale({
      ...fresh,
      settlement: {
        ...fresh.settlement,
        items,
        kept: { ...fresh.amount, value: (BigInt(fresh.amount.value) - moved).toString() },
      },
      updatedAt: this.now().toISOString(),
    });
  }
}
