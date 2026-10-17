import {
  bogotaDay,
  lastBogotaDays,
  startOfBogotaDay,
  startOfBogotaMonth,
} from "../domain/calendar.js";
import type { PaymentFlows } from "../openPayments/flows.js";
import type { Amount, Asset } from "../shared/money.js";
import type { Store } from "../storage/store.js";
import type { MerchantService } from "./merchantService.js";
import { buildNotifications } from "./notifications.js";
import { reservedBalances, type PayoutService } from "./payoutService.js";
import type { SalesService } from "./salesService.js";
import type { PayoutRecord, SaleRecord, SettlementItem } from "./types.js";

const RECENT_SALES = 20;
const RECENT_PAYOUTS = 10;

/**
 * The merchant's till and dashboard: today's sales and split, debt progress, what the grant has
 * spent in its current interval, and this month day by day (the seed of an income passport).
 */
export class DashboardService {
  private readonly now: () => Date;

  constructor(
    private readonly flows: PaymentFlows,
    private readonly merchants: MerchantService,
    private readonly sales: SalesService,
    private readonly store: Store,
    private readonly options: { now?: () => Date; payouts?: PayoutService } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async get(merchantId: string) {
    // Payouts on their way first: one that arrived lowers its debt, which the view must show.
    await this.options.payouts?.refresh(merchantId);
    const merchant = await this.merchants.syncPendingCap(
      await this.merchants.require(merchantId),
    );
    const [mandate, sales, paidThisMonth, payouts] = await Promise.all([
      this.flows.getMandate(merchant.mandateId),
      this.store.listSales({ merchantId }),
      this.sales.paidThisMonth(merchantId),
      this.store.listPayouts(merchantId),
    ]);
    const reserved = await reservedBalances(this.store, merchantId);
    const month = bogotaDay(this.now()).slice(0, 7);
    const paid = sales.filter((sale) => sale.status === "paid" && sale.paidAt);
    const now = this.now();
    const startOfToday = startOfBogotaDay(now).getTime();
    const today = paid.filter(
      (sale) => Date.parse(sale.paidAt!) >= startOfToday,
    );
    const sentToday = today.flatMap(sentItems);
    const money = (value: bigint) => withValue(merchant.asset, value);

    const gross = sum(today.map((sale) => sale.amount));
    const allocated = sum(sentToday.map((item) => item.amount));
    const spent = mandate.spent?.debitAmount;

    return {
      ...(await this.merchants.view(merchant)),
      /** What the till shows as a QR to link the phone that displays each sale (ADR 0018). */
      displayUrl: merchant.displayKey ? this.sales.displayUrl(merchant.displayKey) : null,
      status: mandate.status,
      /** Spent from the monthly-capped grant in its current interval (this calendar month). */
      spentThisMonth: spent && sameAsset(spent, merchant.asset) ? spent : null,
      /**
       * Each rule with what it took from this month's sales (for a debt, how much of its quota is
       * covered), what is reserved and not paid yet, and what was paid out to it this month.
       */
      rules: merchant.rules.map((rule) => ({
        ...rule,
        paidThisMonth: paidThisMonth[rule.id] ?? money(0n),
        ...(rule.kind === "debt" && {
          reserved: money((reserved[rule.id] ?? 0n) > 0n ? reserved[rule.id]! : 0n),
          paidOutThisMonth: money(
            sum(
              payouts
                .filter(
                  (p) => p.ruleId === rule.id && p.month === month && p.status !== "failed",
                )
                .map((p) => p.amount),
            ),
          ),
        }),
      })),
      /** Payments to creditors, newest first. */
      payouts: payouts.slice(0, RECENT_PAYOUTS).map((p) => ({
        id: p.id,
        ruleId: p.ruleId,
        label: p.label,
        amount: p.amount,
        /** The part that came from the shop's profit to complete the quota. */
        topUp: p.topUp ?? null,
        reason: p.reason,
        status: p.status,
        error: p.error,
        /** A failed payout waits for the shopkeeper until this is set. */
        resolution: p.resolution ?? null,
        /** How the move from the emergency fund for it is going, if one was asked for. */
        emergency: p.emergencyDraw?.status ?? null,
        createdAt: p.createdAt,
      })),
      today: {
        salesCount: today.length,
        gross: money(gross),
        kept: money(gross - allocated),
        allocated: money(allocated),
      },
      month: this.month(paid, payouts, reserved, now, money),
      /** What the shopkeeper should know or do now, things to act on first (notifications.ts). */
      notifications: buildNotifications({
        merchant,
        consent: mandate.status,
        emergencyActive: merchant.emergency
          ? (await this.flows.findMandate(merchant.emergency.mandateId)).status === "active"
          : false,
        reserved: Object.fromEntries(
          Object.entries(reserved).map(([ruleId, value]) => [ruleId, money(value > 0n ? value : 0n)]),
        ),
        covered: paidThisMonth,
        payouts,
        now,
      }),
      sales: await Promise.all(
        sales.slice(0, RECENT_SALES).map((sale) => this.sales.view(sale)),
      ),
    };
  }

  /**
   * This calendar month (Bogotá) so far: totals and one entry per day from the 1st to today, for the
   * sales chart and to project when each goal is reached at the current pace.
   */
  private month(
    paid: SaleRecord[],
    payouts: PayoutRecord[],
    reserved: Record<string, bigint>,
    now: Date,
    money: (value: bigint) => Amount,
  ) {
    const start = startOfBogotaMonth(now).getTime();
    const thisMonth = paid.filter((sale) => Date.parse(sale.paidAt!) >= start);
    const today = bogotaDay(now);
    const [year, month, day] = today.split("-").map(Number) as [number, number, number];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const allocatedOf = (list: SaleRecord[]) =>
      sum(list.flatMap(sentItems).map((item) => item.amount));
    const gross = sum(thisMonth.map((sale) => sale.amount));
    const allocated = allocatedOf(thisMonth);
    // Payouts of this month that left or are on their way; what they took from profit lowers it.
    const monthPayouts = payouts.filter(
      (p) => p.month === today.slice(0, 7) && p.status !== "failed",
    );
    const topUpOf = (list: PayoutRecord[]) =>
      sum(list.flatMap((p) => (p.topUp ? [p.topUp] : [])));
    const fromProfit = topUpOf(monthPayouts);
    const kindOf = (kind: string) =>
      sum(thisMonth.flatMap(sentItems).filter((i) => i.kind === kind && i.status !== "reserved").map((i) => i.amount));
    const reservedNow = Object.values(reserved).reduce((t, v) => t + (v > 0n ? v : 0n), 0n);
    return {
      dayOfMonth: day,
      daysInMonth,
      salesCount: thisMonth.length,
      gross: money(gross),
      kept: money(gross - allocated),
      allocated: money(allocated),
      /**
       * What the shop really has left of this month's sales: what it kept, minus what due-day
       * payouts took from profit to complete the quotas (ADR 0015). It can go below zero in a month
       * that paid more than it sold.
       */
      realProfit: money(gross - allocated - fromProfit),
      /** Where the month's money went, for the panel's breakdown. */
      breakdown: {
        sentToSavings: money(kindOf("savings")),
        paidToCreditors: money(sum(monthPayouts.map((p) => p.amount))),
        fromProfit: money(fromProfit),
        reservedPending: money(reservedNow),
      },
      days: lastBogotaDays(now, day).map((date) => {
        const daySales = thisMonth.filter(
          (sale) => bogotaDay(new Date(sale.paidAt!)) === date,
        );
        const dayGross = sum(daySales.map((sale) => sale.amount));
        const dayAllocated = allocatedOf(daySales);
        const dayTopUp = topUpOf(
          monthPayouts.filter((p) => bogotaDay(new Date(p.createdAt)) === date),
        );
        return {
          date,
          salesCount: daySales.length,
          gross: money(dayGross),
          allocated: money(dayAllocated),
          realProfit: money(dayGross - dayAllocated - dayTopUp),
        };
      }),
    };
  }
}

/** Shares that actually left the merchant's wallet (or are on their way). */
function sentItems(sale: SaleRecord): SettlementItem[] {
  return sale.settlement.items.filter(
    (item) => item.status !== "failed" && item.status !== "skipped",
  );
}

function sum(amounts: Amount[]): bigint {
  return amounts.reduce((total, amount) => total + BigInt(amount.value), 0n);
}

function withValue(asset: Asset, value: bigint): Amount {
  return {
    value: value.toString(),
    assetCode: asset.assetCode,
    assetScale: asset.assetScale,
  };
}

function sameAsset(a: Asset, b: Asset): boolean {
  return a.assetCode === b.assetCode && a.assetScale === b.assetScale;
}
