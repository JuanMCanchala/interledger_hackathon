import { randomUUID } from "node:crypto";
import { bogotaDay } from "../domain/calendar.js";
import { describeError } from "../openPayments/errors.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import { AppError, NotFoundError } from "../shared/errors.js";
import { fromMinorUnits, type Amount } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantService } from "./merchantService.js";
import { capRoom, monthCoverage } from "./monthly.js";
import type { MerchantRecord, MerchantRule, PayoutRecord } from "./types.js";

/** A payout with no answer from the wallet for this long may or may not have gone through. */
const UNCONFIRMED_AFTER_MS = 10 * 60 * 1000;

/**
 * What each debt rule has reserved and not paid yet: the shares sales set aside, minus the reserved
 * part of the payouts already sent or on their way (not what they took from profit). The money is
 * still in the merchant's wallet (ADR 0014).
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
    const fromReserve = BigInt(payout.amount.value) - BigInt(payout.topUp?.value ?? "0");
    balances[payout.ruleId] = (balances[payout.ruleId] ?? 0n) - fromReserve;
  }
  return balances;
}

/**
 * Pays creditors the way they expect: one payment on the debt's due day of the month, instead of a
 * small transfer per sale (ADR 0014). That payment completes the month's quota: what was reserved,
 * and what is missing from the shop's profit (ADR 0015). The merchant can also pay a debt early, or
 * run every due payment now, which is how the demo shows the due day without waiting.
 *
 * A payout that fails is never retried on its own: after a timeout the money may have arrived
 * anyway. It waits for the shopkeeper, who checks and retries it or marks it paid.
 */
export class PayoutService {
  private readonly now: () => Date;
  /**
   * Shops whose debts are being paid right now. One pass at a time per shop, and each balance is
   * read inside it, so a click and the scheduler never pay the same reserved money twice.
   */
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
    const payouts = await this.exclusive(merchant.id, async () => {
      const sent: PayoutRecord[] = [];
      for (const rule of debts) {
        const payout = await this.payRule(merchant, rule, input.reason);
        if (payout) sent.push(payout);
      }
      return sent;
    });
    if (payouts === undefined) {
      throw new AppError("Ya se están enviando los pagos de esta tienda: intenta en un momento", 409);
    }
    if (payouts.length === 0) {
      throw new AppError("No hay dinero apartado para pagar todavía", 409);
    }
    return payouts;
  }

  /**
   * The scheduler's pass: for every shop, follow the payouts on their way and pay each debt whose
   * due day has come this month and that has not had its due-day payment yet. A due-day payment
   * that failed counts as had: it waits for the shopkeeper (retry or mark paid), never a new try.
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
                (p) => p.ruleId === rule.id && p.month === month && p.reason === "due-date",
              ),
          );
          if (dueToday.length === 0) continue;
          if ((await this.flows.findMandate(merchant.mandateId)).status !== "active") continue;
          // A shop being paid by hand right now is picked up on the next pass.
          await this.exclusive(merchant.id, async () => {
            for (const rule of dueToday) await this.payRule(merchant, rule, "due-date");
          });
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

  /**
   * Retries a failed payout once the shopkeeper checked it did not go through: a new payout for the
   * same debt and reason, worked out again from what is reserved now.
   */
  async retry(merchantId: string, payoutId: string): Promise<PayoutRecord> {
    const failed = await this.requireUnresolvedFailure(merchantId, payoutId);
    const merchant = await this.merchants.require(merchantId);
    if ((await this.flows.findMandate(merchant.mandateId)).status !== "active") {
      throw new AppError("Tu autorización mensual no está activa: autorízala para poder pagar", 409);
    }
    const rule = merchant.rules.find((r) => r.id === failed.ruleId && r.kind === "debt");
    if (!rule) throw new AppError("Esa obligación ya no existe", 409);
    const result = await this.exclusive(merchant.id, async () => {
      await this.save(failed, { resolution: "retried", resolvedAt: this.now().toISOString() });
      return this.payRule(merchant, rule, failed.reason);
    });
    if (result === undefined) {
      throw new AppError("No quedó nada por pagar a esa obligación", 409);
    }
    return result;
  }

  /**
   * The shopkeeper checked the creditor's wallet and the money of a failed payout did arrive (for
   * example after a timeout): it counts as paid, and nothing is sent again.
   */
  async markPaid(merchantId: string, payoutId: string): Promise<PayoutRecord> {
    const failed = await this.requireUnresolvedFailure(merchantId, payoutId);
    const paid = await this.save(failed, {
      status: "completed",
      resolution: "marked-paid",
      resolvedAt: this.now().toISOString(),
    });
    await this.merchants.recordRepayment(merchantId, paid.ruleId, paid.amount);
    return paid;
  }

  private async requireUnresolvedFailure(merchantId: string, payoutId: string) {
    const payout = (await this.store.listPayouts(merchantId)).find((p) => p.id === payoutId);
    if (!payout) throw new NotFoundError(`No existe el pago ${payoutId}`);
    if (payout.status !== "failed" || payout.resolvedAt) {
      throw new AppError("Ese pago no está esperando revisión", 409);
    }
    return payout;
  }

  /**
   * Follows the payouts on their way; a completed one counts as repaid on its debt. One the wallet
   * never confirmed (the process stopped mid-charge, or the charge never answered) turns into a
   * failure to review, because only the shopkeeper can tell whether its money arrived.
   */
  async refresh(merchantId: string): Promise<void> {
    const all = await this.store.listPayouts(merchantId);
    const cutoff = this.now().getTime() - UNCONFIRMED_AFTER_MS;
    for (const payout of all) {
      if (payout.status === "processing" && !payout.paymentId && Date.parse(payout.updatedAt) < cutoff) {
        await this.save(payout, {
          status: "failed",
          error: "No pudimos confirmar si el pago salió",
        });
      }
    }
    const processing = all.filter((payout) => payout.status === "processing" && payout.paymentId);
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

  /** Runs `task` unless the shop is already being paid; returns undefined when it was. */
  private async exclusive<T>(merchantId: string, task: () => Promise<T>): Promise<T | undefined> {
    if (this.paying.has(merchantId)) return undefined;
    this.paying.add(merchantId);
    try {
      return await task();
    } finally {
      this.paying.delete(merchantId);
    }
  }

  /**
   * Pays a debt in one payout. Early (`manual`) it sends what is reserved. On its due day it sends
   * the month's quota: what is reserved and, if that is short, the rest from the shop's profit, as
   * far as the monthly cap allows (ADR 0015). Never more than what is still owed. Called inside
   * `exclusive`, so the balances read here are the ones being paid. The payout is written before
   * the charge: if the process dies mid-charge, the money counts as on its way rather than
   * reserved, so it is never sent twice.
   */
  private async payRule(
    merchant: MerchantRecord,
    rule: MerchantRule,
    reason: PayoutRecord["reason"],
  ): Promise<PayoutRecord | undefined> {
    const now = this.now();
    const balances = await reservedBalances(this.store, merchant.id);
    let reserved = balances[rule.id] ?? 0n;
    if (reserved < 0n) reserved = 0n;

    let topUp = 0n;
    if (reason === "due-date" && rule.monthlyQuota) {
      const covered = BigInt((await monthCoverage(this.store, merchant.id, now))[rule.id]?.value ?? "0");
      const missing = BigInt(rule.monthlyQuota.value) - covered;
      if (missing > 0n) {
        // Room in the cap once every reserved share (this one included) has left.
        const pending = Object.values(balances).reduce((sum, v) => sum + (v > 0n ? v : 0n), 0n);
        const room = BigInt((await capRoom(this.flows, this.store, merchant, now)).value) - pending;
        topUp = missing < room ? missing : room > 0n ? room : 0n;
      }
    }

    const owed = (await this.store.getMerchant(merchant.id))?.rules.find((r) => r.id === rule.id)
      ?.outstanding;
    if (owed) {
      const left = BigInt(owed.value);
      if (reserved > left) reserved = left;
      if (reserved + topUp > left) topUp = left - reserved;
    }
    const value = reserved + topUp;
    if (value <= 0n) return undefined;

    const timestamp = now.toISOString();
    const amount: Amount = { ...merchant.asset, value: value.toString() };
    let payout = await this.store.savePayout({
      id: randomUUID(),
      merchantId: merchant.id,
      ruleId: rule.id,
      label: rule.label,
      destination: rule.destination,
      amount,
      reason,
      month: bogotaDay(now).slice(0, 7),
      status: "processing",
      ...(topUp > 0n && { topUp: { ...merchant.asset, value: topUp.toString() } }),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    let payment;
    try {
      payment = await this.flows.chargeMandate(merchant.mandateId, {
        receiver: rule.destination,
        amount: fromMinorUnits(amount.value, amount.assetScale),
        amountType: "send",
        description: `MiPlante · ${rule.label} · pago del mes`,
      });
    } catch (error) {
      // The wallet refused it, or did not answer: it waits for the shopkeeper to review it.
      return this.save(payout, { status: "failed", error: describeError(error) });
    }
    payout = await this.save(payout, {
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
  }

  private save(payout: PayoutRecord, changes: Partial<PayoutRecord>) {
    return this.store.savePayout({
      ...payout,
      ...changes,
      updatedAt: this.now().toISOString(),
    });
  }
}
