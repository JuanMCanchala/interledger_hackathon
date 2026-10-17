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
import type { SaleRecord, SettlementItem } from "./types.js";

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
        createdAt: p.createdAt,
      })),
      today: {
        salesCount: today.length,
        gross: money(gross),
        kept: money(gross - allocated),
        allocated: money(allocated),
      },
      month: this.month(paid, now, money),
      /** What the shopkeeper should know or do now, things to act on first (notifications.ts). */
      notifications: buildNotifications({
        merchant,
        consent: mandate.status,
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
    return {
      dayOfMonth: day,
      daysInMonth,
      salesCount: thisMonth.length,
      gross: money(gross),
      kept: money(gross - allocated),
      allocated: money(allocated),
      days: lastBogotaDays(now, day).map((date) => {
        const daySales = thisMonth.filter(
          (sale) => bogotaDay(new Date(sale.paidAt!)) === date,
        );
        return {
          date,
          salesCount: daySales.length,
          gross: money(sum(daySales.map((sale) => sale.amount))),
          allocated: money(allocatedOf(daySales)),
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
