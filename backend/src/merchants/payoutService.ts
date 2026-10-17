import { randomUUID } from "node:crypto";
import { bogotaDay } from "../domain/calendar.js";
import { describeError } from "../openPayments/errors.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError } from "../shared/errors.js";
import { fromMinorUnits, type Amount } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantService } from "./merchantService.js";
import type { MerchantRecord, MerchantRule, PayoutRecord } from "./types.js";

/**
 * What each debt rule has reserved and not paid yet: the shares sales set aside, minus the payouts
 * already sent or on their way. The money is still in the merchant's wallet (ADR 0014).
 */
export async function reservedBalances(
  store: Store,
  merchantId: string,
): Promise<Record<string, bigint>> {
  const [sales, payouts] = await Promise.all([
    store.listSales({ merchantId }),
    store.listPayouts(merchantId),
  ]);
  const balances: Record<string, bigint> = {};
  for (const sale of sales) {
    for (const item of sale.settlement.items) {
      if (item.status !== "reserved") continue;
      balances[item.ruleId] = (balances[item.ruleId] ?? 0n) + BigInt(item.amount.value);
    }
  }
  for (const payout of payouts) {
    if (payout.status === "failed") continue;
    balances[payout.ruleId] = (balances[payout.ruleId] ?? 0n) - BigInt(payout.amount.value);
  }
  return balances;
}

/**
 * Pays creditors the way they expect: one payment for everything reserved, on the debt's due day
 * of the month, instead of a small transfer per sale (ADR 0014). The merchant can also pay a debt
 * early, or run every due payment now, which is how the demo shows the due day without waiting.
 */
export class PayoutService {
  private readonly now: () => Date;
  /** Rules being paid right now, so two clicks or the scheduler never pay the same balance twice. */
  private readonly paying = new Set<string>();
  private readonly refreshing = new Set<string>();
  private running = false;

  constructor(
    private readonly flows: PaymentFlows,
    private readonly merchants: MerchantService,
    private readonly store: Store,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Pays one debt (`ruleId`) or every debt with something reserved. `due-date` records the payment
   * as the due day's, as the scheduler does; `manual` is the merchant paying early.
   */
  async pay(
    merchantId: string,
    input: { ruleId?: string; reason: PayoutRecord["reason"] },
  ): Promise<PayoutRecord[]> {
    const merchant = await this.merchants.require(merchantId);
    if ((await this.flows.findMandate(merchant.mandateId)).status !== "active") {
      throw new AppError("Tu autorización mensual no está activa: autorízala para poder pagar", 409);
    }
    const debts = merchant.rules.filter(
      (rule) => rule.kind === "debt" && (!input.ruleId || rule.id === input.ruleId),
    );
    if (input.ruleId && debts.length === 0) {
      throw new AppError(`El comercio no tiene la obligación ${input.ruleId}`, 404);
    }
    const balances = await reservedBalances(this.store, merchant.id);
    const due = debts.filter((rule) => (balances[rule.id] ?? 0n) > 0n);
    if (due.length === 0) {
      throw new AppError("No hay dinero apartado para pagar todavía", 409);
    }
    const payouts: PayoutRecord[] = [];
    for (const rule of due) {
      const payout = await this.payRule(merchant, rule, input.reason);
      if (payout) payouts.push(payout);
    }
    return payouts;
  }

  /**
   * The scheduler's pass: for every shop, follow the payouts on their way and pay each debt whose
   * due day has come this month and that has not had its due-day payment yet.
   */
  async runDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const today = bogotaDay(this.now());
      const month = today.slice(0, 7);
      const day = Number(today.slice(8, 10));
      for (const merchant of await this.store.listMerchants()) {
        try {
          await this.refresh(merchant.id);
          const payouts = await this.store.listPayouts(merchant.id);
          const dueToday = merchant.rules.filter(
            (rule) =>
              rule.kind === "debt" &&
              (rule.dueDay ?? 28) <= day &&
              !payouts.some(
                (p) =>
                  p.ruleId === rule.id &&
                  p.month === month &&
                  p.reason === "due-date" &&
                  p.status !== "failed",
              ),
          );
          if (dueToday.length === 0) continue;
          if ((await this.flows.findMandate(merchant.mandateId)).status !== "active") continue;
          const balances = await reservedBalances(this.store, merchant.id);
          for (const rule of dueToday) {
            const balance = balances[rule.id] ?? 0n;
            if (balance > 0n) await this.payRule(merchant, rule, "due-date");
          }
        } catch (error) {
          console.warn(`[payouts] comercio ${merchant.id}: ${describeError(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Starts the due-day scheduler; returns a function that stops it. */
  startScheduler(intervalMs = 60_000): () => void {
    const timer = setInterval(() => void this.runDue(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  /** Follows the payouts on their way; a completed one counts as repaid on its debt. */
  async refresh(merchantId: string): Promise<void> {
    const processing = (await this.store.listPayouts(merchantId)).filter(
      (payout) => payout.status === "processing" && payout.paymentId,
    );
    for (const payout of processing) {
      if (this.refreshing.has(payout.id)) continue;
      this.refreshing.add(payout.id);
      try {
        const payment = await this.flows.refreshPayment(payout.paymentId!);
        if (payment.status === "completed") {
          await this.save(payout, { status: "completed" });
          await this.merchants.recordRepayment(merchantId, payout.ruleId, payout.amount);
        } else if (payment.status === "failed" || payment.status === "rejected") {
          await this.save(payout, {
            status: "failed",
            error: payment.error ?? "El pago no se completó",
          });
        }
      } finally {
        this.refreshing.delete(payout.id);
      }
    }
  }

  private async payRule(
    merchant: MerchantRecord,
    rule: MerchantRule,
    reason: PayoutRecord["reason"],
  ): Promise<PayoutRecord | undefined> {
    if (this.paying.has(rule.id)) return undefined;
    this.paying.add(rule.id);
    try {
      // Read once the rule is ours: a balance read before could already have been paid meanwhile.
      const balance = (await reservedBalances(this.store, merchant.id))[rule.id] ?? 0n;
      if (balance <= 0n) return undefined;
      const timestamp = this.now().toISOString();
      const month = bogotaDay(this.now()).slice(0, 7);
      const amount: Amount = { ...merchant.asset, value: balance.toString() };
      const base: PayoutRecord = {
        id: randomUUID(),
        merchantId: merchant.id,
        ruleId: rule.id,
        label: rule.label,
        destination: rule.destination,
        amount,
        reason,
        month,
        status: "processing",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      try {
        const payment = await this.flows.chargeMandate(merchant.mandateId, {
          receiver: rule.destination,
          amount: fromMinorUnits(amount.value, amount.assetScale),
          amountType: "send",
          description: `MiPlante · ${rule.label} · pago del mes`,
        });
        const payout = await this.store.savePayout({
          ...base,
          paymentId: payment.id,
          status:
            payment.status === "completed"
              ? "completed"
              : payment.status === "failed" || payment.status === "rejected"
                ? "failed"
                : "processing",
          error: payment.error,
        });
        if (payout.status === "completed") {
          await this.merchants.recordRepayment(merchant.id, rule.id, amount);
        }
        return payout;
      } catch (error) {
        // Nothing left the wallet: the balance stays reserved for the next try.
        return this.store.savePayout({
          ...base,
          status: "failed",
          error: describeError(error),
        });
      }
    } finally {
      this.paying.delete(rule.id);
    }
  }

  private save(payout: PayoutRecord, changes: Partial<PayoutRecord>) {
    return this.store.savePayout({
      ...payout,
      ...changes,
      updatedAt: this.now().toISOString(),
    });
  }
}
