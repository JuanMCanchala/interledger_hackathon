import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MerchantDashboard, SaleView } from '../../../core/miplante.models';
import {
  SALE_STATUS,
  badgeClass,
  formatAmount,
  formatDay,
  formatMoney,
  formatTime,
  statusInfo,
  toNumber,
} from '../../../core/miplante.utils';
import { BarChart, BarEntry } from '../../../shared/ui/bar-chart';
import { TabName } from '../merchant.types';

@Component({
  selector: 'app-merchant-inicio',
  imports: [BarChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './merchant-inicio.html',
})
export class MerchantInicio {
  readonly merchant = input.required<MerchantDashboard>();
  readonly navigateTab = output<TabName>();
  readonly openSale = output<SaleView>();

  protected readonly formatAmount = formatAmount;
  protected readonly formatTime = formatTime;
  protected readonly toNumber = toNumber;

  protected readonly chartMode = signal<'sales' | 'profit'>('sales');

  protected readonly reviewBannerText = computed(() => {
    const notices = this.merchant().notifications ?? [];
    const toReview = notices.filter((n) => n.kind === 'payout-failed').length;
    if (toReview === 0) return '';
    return toReview === 1
      ? 'Tienes un pago por revisar: no salió o no pudimos confirmarlo. Toca para verlo →'
      : `Tienes ${toReview} pagos por revisar: no salieron o no pudimos confirmarlos. Toca para verlos →`;
  });

  protected readonly capBarWidth = computed(() => {
    const m = this.merchant();
    const spent = toNumber(m.spentThisMonth);
    const cap = toNumber(m.monthlyCap);
    return cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  });

  protected readonly monthChartCaption = computed(() => {
    const { month } = this.merchant();
    return `Llevas ${formatAmount(month.gross)} en ${month.salesCount} ${month.salesCount === 1 ? 'venta' : 'ventas'} · día ${month.dayOfMonth} de ${month.daysInMonth}`;
  });

  protected readonly monthSalesBars = computed<BarEntry[]>(() => {
    const days = this.merchant().month.days;
    return days.map((day, index) => ({
      label: String(index + 1),
      value: toNumber(day.gross),
      title: `${formatDay(day.date)}: ${formatAmount(day.gross)} en ${day.salesCount} ventas`,
      highlight: index === days.length - 1,
    }));
  });

  protected readonly monthDailyGoal = computed(() => {
    const m = this.merchant();
    if (!m.monthlySalesGoal) return undefined;
    const g = toNumber(m.monthlySalesGoal);
    return g > 0 ? g / m.month.daysInMonth : undefined;
  });

  protected readonly monthDailyGoalLabel = computed(() => {
    const daily = this.monthDailyGoal();
    if (!daily) return '';
    const asset = this.merchant().asset ?? { assetCode: 'COP', assetScale: 2 };
    return `Para tu meta: ${formatMoney(daily, asset.assetCode, asset.assetScale)} por día`;
  });

  protected readonly monthSalesSummary = computed(() => {
    const m = this.merchant();
    return `Ventas de este mes por día: ${formatAmount(m.month.gross)} en ${m.month.salesCount} ventas`;
  });

  protected readonly profitChartCaption = computed(() => {
    const { month } = this.merchant();
    const negative = month.days.filter((d) => toNumber(d.realProfit) < 0);
    const total = month.realProfit ?? month.kept;
    return negative.length
      ? `Este mes llevas ${formatAmount(total)} de ganancia real. ${negative.length === 1 ? 'Un día' : `${negative.length} días`} salió más de lo que entró, por completar cuotas con tus ganancias.`
      : `Este mes llevas ${formatAmount(total)} de ganancia real.`;
  });

  protected readonly monthProfitBars = computed<BarEntry[]>(() => {
    const days = this.merchant().month.days;
    return days.map((day, index) => ({
      label: String(index + 1),
      value: Math.max(0, toNumber(day.realProfit ?? day.gross)),
      title: `${formatDay(day.date)}: ${formatAmount(day.realProfit ?? day.gross)} de ganancia real`,
      highlight: index === days.length - 1,
    }));
  });

  protected readonly monthProfitSummary = computed(() => {
    const m = this.merchant();
    const total = m.month.realProfit ?? m.month.kept;
    return `Ganancia real por día este mes: ${formatAmount(total)} en total`;
  });

  protected readonly monthSplitRows = computed(() => {
    const m = this.merchant();
    const zero = { ...m.asset, value: '0' };
    const b = m.month.breakdown ?? {
      sentToSavings: zero,
      paidToCreditors: zero,
      fromProfit: zero,
      reservedPending: zero,
    };
    const real = toNumber(m.month.realProfit ?? m.month.kept);
    const rows = [
      {
        label: 'Ganancia real para ti',
        amount: m.month.realProfit ?? m.month.kept,
        value: real,
        seg: 'seg-kept',
        kept: true,
        note: '',
      },
      {
        label: 'Pagado a tus acreedores',
        amount: b.paidToCreditors,
        value: toNumber(b.paidToCreditors),
        seg: 'seg-debt',
        kept: false,
        note:
          toNumber(b.fromProfit) > 0
            ? `${formatAmount(b.fromProfit)} salieron de tus ganancias`
            : '',
      },
      {
        label: 'Apartado por pagar',
        amount: b.reservedPending,
        value: toNumber(b.reservedPending),
        seg: 'seg-debt',
        kept: false,
        note: '',
      },
      {
        label: 'Enviado a tu ahorro',
        amount: b.sentToSavings,
        value: toNumber(b.sentToSavings),
        seg: 'seg-savings',
        kept: false,
        note: '',
      },
    ];
    const total = rows.reduce((t, r) => t + Math.max(0, r.value), 0);
    return rows.map((r) => ({
      ...r,
      widthPercent: total > 0 && r.value > 0 ? (r.value * 100) / total : 0,
    }));
  });

  protected saleStatusText(status: string): string {
    return statusInfo(SALE_STATUS, status).text;
  }

  protected saleStatusBadgeClass(status: string): string {
    return badgeClass(statusInfo(SALE_STATUS, status).tone);
  }
}
