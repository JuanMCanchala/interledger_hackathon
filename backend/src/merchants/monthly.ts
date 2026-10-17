import { bogotaDay, startOfBogotaMonth } from "../domain/calendar.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import type { Amount } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantRecord } from "./types.js";

/** Sales created this long before the 1st can still be paid this month. */
const LATE_SALE_MS = 24 * 60 * 60 * 1000;

/**
 * What is left of this month's cap. The wallet's count of what the grant spent wins; a grant that
 * spent nothing yet reports none, which is zero. If the wallet cannot say (it did not answer, or
 * answers in another asset), MiPlante's own charges under the grant this month stand in, so the
 * cap is never just ignored.
 */
export async function capRoom(
  flows: PaymentFlows,
  store: Store,
  merchant: MerchantRecord,
  now: Date,
): Promise<Amount> {
  const cap = merchant.monthlyCap;
  const spent = (await flows.getMandate(merchant.mandateId)).spent;
  let used: bigint;
  if (spent && spent.debitAmount === null) {
    used = 0n;
  } else if (
    spent?.debitAmount &&
    spent.debitAmount.assetCode === cap.assetCode &&
    spent.debitAmount.assetScale === cap.assetScale
  ) {
    used = BigInt(spent.debitAmount.value);
  } else {
    used = await chargedThisMonth(store, merchant, now);
  }
  const left = BigInt(cap.value) - used;
  return { ...cap, value: (left > 0n ? left : 0n).toString() };
}

/** What MiPlante charged under the shop's grant since the 1st (Bogotá), failed charges aside. */
async function chargedThisMonth(store: Store, merchant: MerchantRecord, now: Date): Promise<bigint> {
  const since = startOfBogotaMonth(now).getTime();
  const charges = await store.listPayments({ mandateId: merchant.mandateId });
  return charges
    .filter(
      (p) =>
        Date.parse(p.createdAt) >= since &&
        p.status !== "failed" &&
        p.status !== "rejected" &&
        p.debitAmount?.assetCode === merchant.monthlyCap.assetCode,
    )
    .reduce((sum, p) => sum + BigInt(p.debitAmount!.value), 0n);
}

/**
 * How much of each rule's month is covered: the shares this month's sales took for it (sent or
 * reserved; failed or skipped shares do not count), plus what a due-day payout added from the
 * shop's profit to complete a debt's quota (ADR 0015). A debt stops taking its share once this
 * reaches its monthly quota.
 */
export async function monthCoverage(
  store: Store,
  merchantId: string,
  now: Date,
  exceptSaleId?: string,
): Promise<Record<string, Amount>> {
  const monthStart = startOfBogotaMonth(now).getTime();
  const month = bogotaDay(now).slice(0, 7);
  const [sales, payouts] = await Promise.all([
    store.listSales({
      merchantId,
      createdSince: new Date(monthStart - LATE_SALE_MS).toISOString(),
    }),
    store.listPayouts(merchantId),
  ]);
  const covered: Record<string, Amount> = {};
  const add = (ruleId: string, amount: Amount) => {
    const sum = BigInt(covered[ruleId]?.value ?? "0") + BigInt(amount.value);
    covered[ruleId] = { ...amount, value: sum.toString() };
  };
  for (const sale of sales) {
    if (sale.id === exceptSaleId || !sale.paidAt) continue;
    if (Date.parse(sale.paidAt) < monthStart) continue;
    for (const item of sale.settlement.items) {
      if (item.status === "failed" || item.status === "skipped") continue;
      add(item.ruleId, item.amount);
    }
  }
  for (const payout of payouts) {
    if (payout.month === month && payout.status !== "failed" && payout.topUp) {
      add(payout.ruleId, payout.topUp);
    }
  }
  return covered;
}
