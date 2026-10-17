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
import type { SalesService } from "./salesService.js";
import type { SaleRecord, SettlementItem } from "./types.js";

const HISTORY_DAYS = 7;
const RECENT_SALES = 20;

/**
 * The merchant's till and dashboard: today's sales and split, debt progress, what the grant has
 * spent in its current interval, and a seven-day income history (the seed of an income passport).
 */
export class DashboardService {
  private readonly now: () => Date;

  constructor(
    private readonly flows: PaymentFlows,
    private readonly merchants: MerchantService,
    private readonly sales: SalesService,
    private readonly store: Store,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async get(merchantId: string) {
    const merchant = await this.merchants.syncPendingCap(
      await this.merchants.require(merchantId),
    );
    const [mandate, sales, paidThisMonth] = await Promise.all([
      this.flows.getMandate(merchant.mandateId),
      this.store.listSales({ merchantId }),
      this.sales.paidThisMonth(merchantId),
    ]);
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
      /** Each rule with what it received this month, to show how much of its quota is paid. */
      rules: merchant.rules.map((rule) => ({
        ...rule,
        paidThisMonth: paidThisMonth[rule.id] ?? money(0n),
      })),
      today: {
        salesCount: today.length,
        gross: money(gross),
        kept: money(gross - allocated),
        allocated: money(allocated),
        byRule: merchant.rules.map((rule) => ({
          ruleId: rule.id,
          label: rule.label,
          amount: money(
            sum(
              sentToday
                .filter((item) => item.ruleId === rule.id)
                .map((item) => item.amount),
            ),
          ),
        })),
      },
      history: lastBogotaDays(now, HISTORY_DAYS).map((date) => {
        const daySales = paid.filter(
          (sale) => bogotaDay(new Date(sale.paidAt!)) === date,
        );
        return {
          date,
          salesCount: daySales.length,
          gross: money(sum(daySales.map((sale) => sale.amount))),
        };
      }),
      month: this.month(paid, now, money),
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
