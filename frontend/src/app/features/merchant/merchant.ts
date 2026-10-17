import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { parseSpokenSale } from '../../core/spoken-amount';
import { VoiceService } from '../../core/voice.service';
import {
  Amount,
  MeResponse,
  MerchantDashboard,
  PayoutView,
  RuleView,
  SaleView,
  Tone,
  UserView,
} from '../../core/miplante.models';
import {
  MAX_RULES,
  MAX_TOTAL_PERCENT,
  MERCHANT_STATUS,
  PAYOUT_STATUS,
  RULE_KIND,
  SALE_STATUS,
  STORAGE_KEYS,
  badgeClass,
  copyText,
  formatAmount,
  formatDay,
  formatMoney,
  formatThousandsInput,
  formatTime,
  groupThousands,
  normalizeDecimal,
  normalizeWallet,
  poll,
  previewSplit,
  salePace,
  statusInfo,
  toDecimal,
  toMinor,
  toNumber,
  walletName,
} from '../../core/miplante.utils';
import { Gloria, GloriaSection } from '../gloria/gloria';
import { Logo } from '../../shared/brand/logo';
import { BarChart, BarEntry } from '../../shared/ui/bar-chart';
import { ProgressRing } from '../../shared/ui/progress-ring';
import { QrCode } from '../../shared/ui/qr-code';
import { SplitList } from '../../shared/ui/split-list';

type TabName = 'inicio' | 'vender' | 'efectivo' | 'metas' | 'repartos' | 'ajustes' | 'avisos';
const TABS: readonly TabName[] = ['inicio', 'vender', 'efectivo', 'metas', 'repartos', 'ajustes', 'avisos'];

const RESUME_WINDOW_MS = 10 * 60 * 1000;
const BUSY_REFRESH_MS = 5_000;
const IDLE_REFRESH_MS = 30_000;
const QUICK_AMOUNTS = [5000, 10000, 20000, 50000, 100000];
const MIN_SALE = 100;
const MAX_SALE = 100_000_000;

interface RuleDraft {
  key: number;
  id?: string;
  storedOutstanding?: string;
  label: string;
  category: string;
  kind: 'debt' | 'savings';
  sharePercent: number | null;
  monthlyQuota: string;
  outstanding: string;
  savingsGoal: string;
  dueDay: number | null;
  destination: string;
}

interface BannerMessage {
  text: string;
  tone: Tone;
}

let nextRuleDraftKey = 1;

@Component({
  selector: 'app-merchant',
  imports: [
    FormsModule,
    RouterLink,
    BarChart,
    ProgressRing,
    QrCode,
    SplitList,
    Logo,
    Gloria,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'miplante-page panel-page',
    '(window:hashchange)': 'syncTabFromHash()',
  },
  templateUrl: './merchant.html',
})
export default class MerchantPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly voice = inject(VoiceService);

  protected readonly formatAmount = formatAmount;
  protected readonly formatMoney = formatMoney;
  protected readonly groupThousandsOf = (amount?: Amount | null) =>
    amount ? groupThousands(toDecimal(amount)) : '';
  protected readonly formatTime = formatTime;
  protected readonly toNumber = toNumber;
  protected readonly walletName = walletName;
  protected readonly maxRules = MAX_RULES;
  protected readonly quickAmounts = QUICK_AMOUNTS;

  protected readonly todayDateText = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  protected readonly currentMonthName = new Date().toLocaleDateString('es-CO', {
    month: 'long',
  });

  protected readonly tab = signal<TabName>('inicio');
  protected readonly merchant = signal<MerchantDashboard | null>(null);
  protected readonly account = signal<UserView | null>(null);
  protected readonly missingText = signal('');
  protected readonly loadError = signal('');

  protected readonly consentBusy = signal(false);

  // Vender state
  protected readonly saleAmountInputVal = signal('');
  protected saleDescription = '';
  protected readonly saleFormError = signal('');
  protected readonly saleBusy = signal(false);
  protected readonly currentSale = signal<{ sale: SaleView; payUrl: string } | null>(null);
  protected readonly showOn = signal<'phone' | 'here'>(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
      ? 'here'
      : 'phone',
  );
  protected readonly copyLabel = signal('Copiar');
  /** What GlorIA or the dictation filled in, for the shopkeeper to check before charging. */
  protected readonly saleHint = signal('');
  /** How the next sale is paid: a QR the customer scans, or cash in hand (ADR 0019). */
  protected readonly sellMode = signal<'qr' | 'cash'>('qr');
  protected readonly cashMessage = signal<BannerMessage | null>(null);
  protected readonly cashBusy = signal(false);
  protected depositInput = '';
  protected readonly displayBusy = signal(false);
  protected readonly displayMessage = signal<BannerMessage | null>(null);

  // Repartos & Payouts state
  protected readonly editingRules = signal(false);
  protected readonly ruleDrafts = signal<RuleDraft[]>([]);
  protected readonly rulesError = signal('');
  protected readonly rulesSavedMsg = signal('');
  protected readonly rulesSaving = signal(false);
  protected readonly payoutBusy = signal(false);
  protected readonly payoutMessage = signal<BannerMessage | null>(null);

  // Avisos state
  protected readonly seenIds = signal<Set<string>>(this.readSeenNotices());
  protected readonly noticeMessage = signal<BannerMessage | null>(null);
  protected readonly noticeBusy = signal(false);
  protected readonly confirmingNotice = signal<Record<string, 'mark-paid' | 'use-emergency' | null>>({});

  // Inicio & Metas UI state
  protected readonly chartMode = signal<'sales' | 'profit'>('sales');
  protected readonly editingSalesGoal = signal(false);
  protected readonly showDisplayQr = signal(false);

  // Ajustes state
  protected shopNameInput = '';
  protected salesGoalInput = '';
  protected capNewInput = '';
  protected emergencyPickId = '';
  private settingsFilled = false;
  protected readonly settingsBusy = signal(false);
  protected readonly shopMessage = signal<BannerMessage | null>(null);
  protected readonly goalMessage = signal<BannerMessage | null>(null);
  protected readonly capMessage = signal<BannerMessage | null>(null);
  protected readonly emergencyMessage = signal<BannerMessage | null>(null);
  protected readonly simulateMessage = signal<BannerMessage | null>(null);

  protected merchantId = '';
  private merchantPath = '';
  private resumed = false;
  private stopSalePoll: (() => void) | null = null;
  /** Notices already known on this screen: only the ones arriving later are said out loud. */
  private announcedNotices: Set<string> | null = null;

  protected readonly canSell = computed(() => this.merchant()?.status === 'active');

  protected readonly liveSalePreview = computed(() => {
    const m = this.merchant();
    if (!m) return null;
    const raw = normalizeDecimal(this.saleAmountInputVal()) || '10000';
    const scale = m.asset.assetScale ?? 2;
    const saleMinor = toMinor(raw, scale);
    const totalMinor = saleMinor > 0n ? saleMinor : toMinor('10000', scale);
    const split = previewSplit(
      totalMinor,
      m.rules.map((r) => ({
        label: r.label,
        kind: r.kind,
        shareBps: r.shareBps,
        outstandingMinor: r.outstanding ? BigInt(r.outstanding.value) : undefined,
      })),
    );
    const fmt = (minor: bigint) =>
      formatAmount({
        value: String(minor),
        assetCode: m.asset.assetCode,
        assetScale: scale,
      });
    const pct = (minor: bigint) =>
      totalMinor > 0n ? Math.round((Number(minor) * 100) / Number(totalMinor)) : 0;
    return {
      totalFormatted: fmt(totalMinor),
      keptFormatted: fmt(split.kept),
      keptPercent: pct(split.kept),
      items: split.items.map((item) => ({
        label: item.label,
        kind: item.kind,
        formatted: fmt(item.amount),
        percent: pct(item.amount),
      })),
    };
  });

  protected isQuickAmountSelected(q: number): boolean {
    return normalizeDecimal(this.saleAmountInputVal()) === String(q);
  }

  protected readonly unseenCount = computed(() => {
    const notices = this.merchant()?.notifications ?? [];
    const seen = this.seenIds();
    return notices.filter((n) => !seen.has(n.id)).length;
  });

  protected readonly reviewBannerText = computed(() => {
    const notices = this.merchant()?.notifications ?? [];
    const toReview = notices.filter((n) => n.kind === 'payout-failed').length;
    if (toReview === 0) return '';
    return toReview === 1
      ? 'Tienes un pago por revisar: no salió o no pudimos confirmarlo. Toca para verlo →'
      : `Tienes ${toReview} pagos por revisar: no salieron o no pudimos confirmarlos. Toca para verlos →`;
  });

  protected readonly statusBanner = computed(() => {
    const m = this.merchant();
    if (!m) return null;
    const messages: Record<string, [Tone, string]> = {
      'awaiting-consent': [
        'wait',
        'Falta tu autorización. Mientras no la apruebes, tus ventas no se reparten solas. Si ya la aprobaste, esta página se actualiza sola.',
      ],
      rejected: [
        'bad',
        'La autorización no se completó. A veces pasa si entraste a la billetera con otra cuenta.',
      ],
      revoked: [
        'bad',
        'Cancelaste la autorización, así que tus ventas ya no se reparten solas.',
      ],
      failed: ['bad', 'No pudimos activar tu autorización.'],
    };
    const entry = messages[m.status];
    if (!entry) return null;
    return {
      tone: entry[0],
      text: entry[1],
      wallet: walletName(m.wallet),
    };
  });

  // Inicio computed values
  protected readonly monthChartCaption = computed(() => {
    const m = this.merchant();
    if (!m) return '';
    const { month } = m;
    return `Llevas ${formatAmount(month.gross)} en ${month.salesCount} ${month.salesCount === 1 ? 'venta' : 'ventas'} · día ${month.dayOfMonth} de ${month.daysInMonth}`;
  });

  protected readonly monthSalesBars = computed<BarEntry[]>(() => {
    const m = this.merchant();
    if (!m) return [];
    const days = m.month.days;
    return days.map((day, index) => ({
      label: String(index + 1),
      value: toNumber(day.gross),
      title: `${formatDay(day.date)}: ${formatAmount(day.gross)} en ${day.salesCount} ventas`,
      highlight: index === days.length - 1,
    }));
  });

  protected readonly monthDailyGoal = computed(() => {
    const m = this.merchant();
    if (!m?.monthlySalesGoal) return undefined;
    const g = toNumber(m.monthlySalesGoal);
    return g > 0 ? g / m.month.daysInMonth : undefined;
  });

  protected readonly monthDailyGoalLabel = computed(() => {
    const daily = this.monthDailyGoal();
    return daily ? `Para tu meta: ${this.money(daily)} por día` : '';
  });

  protected readonly monthSalesSummary = computed(() => {
    const m = this.merchant();
    if (!m) return '';
    return `Ventas de este mes por día: ${formatAmount(m.month.gross)} en ${m.month.salesCount} ventas`;
  });

  protected readonly monthSplitRows = computed(() => {
    const m = this.merchant();
    if (!m) return [];
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

  protected readonly profitChartCaption = computed(() => {
    const m = this.merchant();
    if (!m) return '';
    const { month } = m;
    const negative = month.days.filter((d) => toNumber(d.realProfit) < 0);
    const total = month.realProfit ?? month.kept;
    return negative.length
      ? `Este mes llevas ${formatAmount(total)} de ganancia real. ${negative.length === 1 ? 'Un día' : `${negative.length} días`} salió más de lo que entró, por completar cuotas con tus ganancias.`
      : `Este mes llevas ${formatAmount(total)} de ganancia real.`;
  });

  protected readonly monthProfitBars = computed<BarEntry[]>(() => {
    const m = this.merchant();
    if (!m) return [];
    const days = m.month.days;
    return days.map((day, index) => ({
      label: String(index + 1),
      value: Math.max(0, toNumber(day.realProfit ?? day.gross)),
      title: `${formatDay(day.date)}: ${formatAmount(day.realProfit ?? day.gross)} de ganancia real`,
      highlight: index === days.length - 1,
    }));
  });

  protected readonly monthProfitSummary = computed(() => {
    const m = this.merchant();
    if (!m) return '';
    const total = m.month.realProfit ?? m.month.kept;
    return `Ganancia real por día este mes: ${formatAmount(total)} en total`;
  });

  protected readonly capBarWidth = computed(() => {
    const m = this.merchant();
    if (!m) return 0;
    const spent = toNumber(m.spentThisMonth);
    const cap = toNumber(m.monthlyCap);
    return cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  });

  // Metas computed values (Futuro + Aspiración: solo meta de ventas y ahorro con meta/proyección)
  protected readonly salesGoalCard = computed(() => {
    const m = this.merchant();
    if (!m) return null;
    const { dayOfMonth, daysInMonth } = m.month;
    const salesGoal = toNumber(m.monthlySalesGoal);
    const sold = toNumber(m.month.gross);
    if (salesGoal > 0) {
      const ratio = sold / salesGoal;
      const dailyTarget = salesGoal / daysInMonth;
      return {
        hasGoal: true,
        ratio,
        ringLabel: `Meta de ventas: ${Math.round(ratio * 100)}%`,
        soldFormatted: formatAmount(m.month.gross),
        goalFormatted: formatAmount(m.monthlySalesGoal),
        dailyPaceFormatted: this.money(dailyTarget),
        note: this.projection({
          done: sold,
          target: salesGoal,
          dayOfMonth,
          daysInMonth,
          monthly: true,
        }),
      };
    }
    return {
      hasGoal: false,
      ratio: 0,
      ringLabel: 'Meta de ventas: 0%',
      soldFormatted: formatAmount(m.month.gross),
      goalFormatted: '',
      dailyPaceFormatted: '',
      note: 'Fija cuánto te propones vender este mes para medir tu ritmo diario y proyectar cuándo lo logras.',
    };
  });

  protected readonly savingsGoalCards = computed(() => {
    const m = this.merchant();
    if (!m) return [];
    const { dayOfMonth, daysInMonth } = m.month;
    return m.rules
      .filter((r) => r.kind === 'savings')
      .map((rule) => {
        const saved = toNumber(rule.repaid);
        const goal = toNumber(rule.savingsGoal);
        const thisMonth = toNumber(rule.paidThisMonth);
        const sharePct = (rule.shareBps / 100).toLocaleString('es-CO', {
          maximumFractionDigits: 2,
        });
        if (goal > 0) {
          const ratio = saved / goal;
          return {
            id: rule.id,
            eyebrow: `${rule.category || 'Ahorro'} · ${sharePct}% por venta`,
            title: rule.label,
            hasGoal: true,
            ratio,
            tone: 'info' as const,
            ringLabel: `${rule.label}: ${Math.round(ratio * 100)}%`,
            detail: `${formatAmount(rule.repaid)} de ${formatAmount(rule.savingsGoal)}`,
            thisMonthFormatted: formatAmount(rule.paidThisMonth),
            note:
              saved >= goal
                ? '¡Meta de ahorro cumplida!'
                : this.projection({
                    done: thisMonth,
                    target: thisMonth + (goal - saved),
                    dayOfMonth,
                    daysInMonth,
                    monthly: false,
                  }),
          };
        }
        return {
          id: rule.id,
          eyebrow: `${rule.category || 'Ahorro'} · ${sharePct}% por venta`,
          title: rule.label,
          hasGoal: false,
          ratio: 0,
          tone: 'info' as const,
          ringLabel: `${rule.label}: 0%`,
          detail: `Acumulado: ${formatAmount(rule.repaid)}`,
          thisMonthFormatted: formatAmount(rule.paidThisMonth),
          note: 'Ponle una meta en Repartos para proyectar la fecha exacta en que la alcanzas.',
        };
      });
  });

  protected readonly cashSales = computed(() =>
    (this.merchant()?.sales ?? []).filter((s) => s.method === 'cash'),
  );

  // Repartos computed values (Presente + Operación)
  protected readonly repartosStats = computed(() => {
    const m = this.merchant();
    if (!m) return null;
    const allocatedBps = m.rules.reduce((sum, r) => sum + r.shareBps, 0);
    const allocatedPct = allocatedBps / 100;
    const keptPct = Math.max(0, 100 - allocatedPct);
    const reservedTotal = m.rules
      .filter((r) => r.kind === 'debt')
      .reduce((sum, r) => sum + toNumber(r.reserved), 0);
    const paidMonthTotal = m.rules.reduce(
      (sum, r) => sum + toNumber(r.paidThisMonth),
      0,
    );
    return {
      allocatedPctText: allocatedPct.toLocaleString('es-CO', {
        maximumFractionDigits: 2,
      }),
      keptPctText: keptPct.toLocaleString('es-CO', {
        maximumFractionDigits: 2,
      }),
      reservedTotalFormatted: this.money(reservedTotal),
      paidMonthTotalFormatted: this.money(paidMonthTotal),
      debtCount: m.rules.filter((r) => r.kind === 'debt').length,
      savingsCount: m.rules.filter((r) => r.kind === 'savings').length,
    };
  });

  protected readonly groupedRules = computed(() => {
    const m = this.merchant();
    if (!m) return [];
    const groups = new Map<string, RuleView[]>();
    for (const rule of m.rules) {
      const name = rule.category || RULE_KIND[rule.kind] || rule.kind;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(rule);
    }
    return [...groups.entries()].map(([name, rules]) => ({ name, rules }));
  });

  protected readonly rulesPreview = computed(() => {
    const m = this.merchant();
    const scale = m?.asset.assetScale ?? 2;
    const code = m?.asset.assetCode ?? 'COP';
    const fmtMinor = (minor: bigint) => formatMoney(Number(minor) / 10 ** scale, code);

    const drafts = this.ruleDrafts();
    const parsed = drafts.map((d) => {
      const p = d.sharePercent !== null && Number.isFinite(Number(d.sharePercent))
        ? Math.round(Number(d.sharePercent) * 100) / 100
        : NaN;
      const quotaDec = d.kind === 'debt' ? normalizeDecimal(d.monthlyQuota) : '';
      const outDec = d.kind === 'debt' ? normalizeDecimal(d.outstanding) : '';
      return { ...d, shareNum: p, quotaDec, outDec };
    });

    const valid = parsed.filter((r) => Number.isFinite(r.shareNum) && r.shareNum > 0);
    const saleMinor = toMinor('10000', scale);
    const split = previewSplit(
      saleMinor,
      valid.map((r) => ({
        label: r.label.trim() || (r.kind === 'debt' ? 'Crédito' : 'Ahorro'),
        kind: r.kind,
        shareBps: Math.round(r.shareNum * 100),
        outstandingMinor: r.outDec ? toMinor(r.outDec, scale) : undefined,
      })),
    );

    const parts = [
      `tú recibes ${fmtMinor(split.kept)}`,
      ...split.items.map((item) => `${item.label} ${fmtMinor(item.amount)}`),
    ];
    const sentence = `Por una venta de ${fmtMinor(saleMinor)}: ${parts.join(' · ')}`;
    const pct = (minor: bigint) => (Number(minor) * 100) / Number(saleMinor);

    const totalPercent = valid.reduce((sum, r) => sum + r.shareNum, 0);
    const overLimit = totalPercent > MAX_TOTAL_PERCENT;
    const warning = overLimit
      ? `Las reglas suman ${totalPercent.toLocaleString('es-CO')}%. El máximo es ${MAX_TOTAL_PERCENT}% para que siempre te quede una parte de cada venta.`
      : '';

    const capMinor = m ? BigInt(m.monthlyCap.value) : undefined;
    const quotasMinor = parsed
      .filter((r) => r.kind === 'debt' && r.quotaDec)
      .reduce((sum, r) => sum + toMinor(r.quotaDec, scale), 0n);
    const overCap = capMinor !== undefined && quotasMinor > capMinor;
    const capWarning = overCap
      ? `Las cuotas del mes suman ${fmtMinor(quotasMinor)}, más que tu límite mensual de ${fmtMinor(capMinor!)}. Baja alguna cuota.`
      : '';

    return {
      sentence,
      keptPercent: pct(split.kept),
      keptFormatted: fmtMinor(split.kept),
      items: split.items.map((item) => ({
        label: item.label,
        kind: item.kind,
        widthPercent: pct(item.amount),
        formatted: fmtMinor(item.amount),
      })),
      totalPercent,
      overLimit,
      overCap,
      warning,
      capWarning,
    };
  });

  // Ajustes computed values
  protected readonly totalQuotasAmount = computed(() => {
    const m = this.merchant();
    if (!m) return 0;
    return m.rules
      .filter((r) => r.kind === 'debt')
      .reduce((sum, r) => sum + toNumber(r.monthlyQuota), 0);
  });

  protected readonly savingsRules = computed(() =>
    (this.merchant()?.rules ?? []).filter((r) => r.kind === 'savings'),
  );

  protected readonly emergencyBanner = computed<BannerMessage>(() => {
    const m = this.merchant();
    const savings = this.savingsRules();
    if (!savings.length) {
      return {
        tone: 'info',
        text: 'Agrega primero una billetera de ahorro en tus repartos.',
      };
    }
    const cur = m?.emergency;
    if (!cur) {
      return {
        tone: 'info',
        text: 'Sin autorizar: si un pago falla, solo podrás reintentarlo o marcarlo como pagado.',
      };
    }
    const label = cur.label ?? 'tu ahorro';
    switch (cur.status) {
      case 'active':
        return { tone: 'ok', text: `Autorizado: ${label} es tu último recurso.` };
      case 'awaiting-consent':
        return { tone: 'wait', text: `Falta que apruebes ${label} en tu billetera.` };
      case 'rejected':
        return { tone: 'bad', text: 'La autorización no se completó. Puedes intentarlo de nuevo.' };
      case 'revoked':
        return { tone: 'bad', text: 'Cancelaste la autorización de tu fondo de emergencia.' };
      default:
        return { tone: 'bad', text: 'No pudimos activar la autorización. Puedes intentarlo de nuevo.' };
    }
  });

  ngOnInit(): void {
    this.title.setTitle('Mi caja · MiPlante');
    if (!this.api.requireSession()) return;

    this.merchantId = this.route.snapshot.queryParamMap.get('id') || '';
    if (!this.merchantId) {
      this.api
        .homeOfSignedIn()
        .then((home) =>
          this.router.navigateByUrl(`${home}${window.location.hash}`, {
            replaceUrl: true,
          }),
        )
        .catch((err: unknown) =>
          this.loadError.set((err as Error)?.message || 'Error'),
        );
      return;
    }

    this.merchantPath = `/api/merchants/${encodeURIComponent(this.merchantId)}`;
    this.syncTabFromHash();
    this.loadAccount();
    poll(
      () => this.loadMerchant(),
      () => (this.isBusy() ? BUSY_REFRESH_MS : IDLE_REFRESH_MS),
      this.destroyRef,
    );
  }

  protected syncTabFromHash(): void {
    const raw = window.location.hash.replace(/^#/, '') as TabName;
    const nextTab: TabName = TABS.includes(raw) ? raw : 'inicio';
    this.tab.set(nextTab);
    const mode = new URLSearchParams(window.location.search).get('modo');
    if (mode === 'efectivo') {
      this.sellMode.set('cash');
    } else if (mode === 'qr') {
      this.sellMode.set('qr');
    }
    if (nextTab === 'avisos') {
      const notices = this.merchant()?.notifications ?? [];
      this.markNoticesSeen(notices.map((n) => n.id));
    }
    if (nextTab === 'vender') {
      this.startSalePolling();
    } else {
      this.stopSalePolling();
    }
    window.scrollTo({ top: 0 });
  }

  protected setSellMode(mode: 'qr' | 'cash'): void {
    this.sellMode.set(mode);
    this.saleFormError.set('');
    const url = new URL(window.location.href);
    if (mode === 'cash') {
      url.searchParams.set('modo', 'efectivo');
    } else {
      url.searchParams.delete('modo');
    }
    history.replaceState(null, '', url.toString());
  }

  protected selectTab(next: TabName): void {
    window.location.hash = next;
    this.syncTabFromHash();
  }

  private isBusy(): boolean {
    const cur = this.currentSale();
    if (cur && !this.isSaleFinal(cur.sale)) return true;
    const m = this.merchant();
    if (m?.payouts?.some((p) => p.status === 'processing')) return true;
    return Boolean(
      m?.sales?.some((s) =>
        (s.settlement?.items || []).some((item) => item.status === 'processing'),
      ),
    );
  }

  private async loadAccount(): Promise<void> {
    try {
      const { user } = await this.api.get<MeResponse>('/api/auth/me');
      this.account.set(user);
    } catch {
      // Optional account card
    }
  }

  private async loadMerchant(): Promise<boolean> {
    try {
      const m = await this.api.get<MerchantDashboard>(this.merchantPath);
      this.loadError.set('');
      this.missingText.set('');
      this.merchant.set(m);
      this.title.setTitle(`${m.name} · MiPlante`);
      this.announceNewNotices(m);

      if (!this.depositInput && m.cash?.toDeposit && toNumber(m.cash.toDeposit) > 0) {
        this.depositInput = groupThousands(toDecimal(m.cash.toDeposit));
      }

      if (this.tab() === 'avisos') {
        this.markNoticesSeen((m.notifications ?? []).map((n) => n.id));
      }

      if (!this.settingsFilled) {
        this.settingsFilled = true;
        this.shopNameInput = m.name;
        this.salesGoalInput = groupThousands(toDecimal(m.monthlySalesGoal));
        this.capNewInput = groupThousands(toDecimal(m.monthlyCap));
        const firstSavings = m.rules.find((r) => r.kind === 'savings');
        if (firstSavings && !this.emergencyPickId) {
          this.emergencyPickId = firstSavings.id;
        }
      }

      this.resumeLatestSale(m);
      return true;
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr?.status === 404) {
        this.missingText.set(
          'Esta caja no existe o es de otra cuenta. Entra con la cuenta que la registró.',
        );
        this.merchant.set(null);
        return false;
      }
      this.loadError.set(
        `No pudimos actualizar tu caja: ${apiErr?.message || 'Error'}`,
      );
      return true;
    }
  }

  protected money(value: number): string {
    const asset = this.merchant()?.asset ?? { assetCode: 'COP', assetScale: 2 };
    return formatMoney(value, asset.assetCode, asset.assetScale);
  }

  protected merchantStatusText(status: string): string {
    return statusInfo(MERCHANT_STATUS, status).text;
  }

  protected merchantStatusBadgeClass(status: string): string {
    return badgeClass(statusInfo(MERCHANT_STATUS, status).tone);
  }

  protected saleStatusText(status: string): string {
    return statusInfo(SALE_STATUS, status).text;
  }

  protected saleStatusBadgeClass(status: string): string {
    return badgeClass(statusInfo(SALE_STATUS, status).tone);
  }

  protected payoutStatusText(status: string): string {
    return statusInfo(PAYOUT_STATUS, status).text;
  }

  protected payoutStatusBadgeClass(status: string): string {
    return badgeClass(statusInfo(PAYOUT_STATUS, status).tone);
  }

  protected ruleKindLabel(kind: string): string {
    return RULE_KIND[kind] || kind;
  }

  protected debtProgress(rule: RuleView): number {
    const quota = toNumber(rule.monthlyQuota);
    const paid = toNumber(rule.paidThisMonth);
    return quota > 0 ? Math.min(100, (paid / quota) * 100) : 0;
  }

  protected savingsProgress(rule: RuleView): number {
    const goal = toNumber(rule.savingsGoal);
    const repaid = toNumber(rule.repaid);
    return goal > 0 ? Math.min(100, (repaid / goal) * 100) : 0;
  }

  protected dueText(rule: RuleView): string {
    const day = rule.dueDay ?? 28;
    const today = new Date();
    const paidThisMonth =
      toNumber(rule.paidOutThisMonth) > 0 && toNumber(rule.reserved) <= 0;
    const next =
      today.getDate() <= day && !paidThisMonth
        ? new Date(today.getFullYear(), today.getMonth(), day)
        : new Date(today.getFullYear(), today.getMonth() + 1, day);
    return `Se le paga el ${next.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}.`;
  }

  private projection({
    done,
    target,
    dayOfMonth,
    daysInMonth,
    monthly,
  }: {
    done: number;
    target: number;
    dayOfMonth: number;
    daysInMonth: number;
    monthly: boolean;
  }): string {
    if (target <= 0) return '';
    if (done >= target) return '¡Meta cumplida!';
    const perDay = done / dayOfMonth;
    const left = target - done;
    if (monthly) {
      const remainingDays = daysInMonth - dayOfMonth;
      if (perDay > 0) {
        const finishDay = dayOfMonth + Math.ceil(left / perDay);
        if (finishDay <= daysInMonth) {
          return `A este ritmo la completas el ${finishDay} de ${this.currentMonthName}.`;
        }
      }
      return remainingDays > 0
        ? `Para lograrla este mes necesitas ${this.money(left / remainingDays)} por día.`
        : `Faltan ${this.money(left)} y hoy termina el mes.`;
    }
    if (perDay <= 0) return 'Aún no hay ahorro este mes para proyectar la fecha.';
    const date = new Date(Date.now() + Math.ceil(left / perDay) * 86_400_000);
    return `A este ritmo la alcanzas hacia el ${date.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}.`;
  }

  protected async requestConsent(): Promise<void> {
    if (this.consentBusy()) return;
    this.consentBusy.set(true);
    try {
      const { redirectUrl } = await this.api.post<{ redirectUrl: string }>(
        `${this.merchantPath}/consent`,
        {},
      );
      window.location.href = redirectUrl;
    } catch (err: unknown) {
      this.loadError.set((err as Error)?.message || 'Error al abrir la billetera');
    } finally {
      this.consentBusy.set(false);
    }
  }

  // Vender methods
  protected onSaleAmountInput(raw: string): void {
    this.saleAmountInputVal.set(formatThousandsInput(raw));
    this.saleFormError.set('');
  }

  protected pickQuickAmount(val: number): void {
    this.saleAmountInputVal.set(val.toLocaleString('es-CO'));
    this.saleFormError.set('');
  }

  /** "Veinte mil de arroz" said to the till fills the amount and the note; charging is still a tap. */
  protected async dictateSale(): Promise<void> {
    if (this.voice.listening()) {
      this.voice.stopListening();
      return;
    }
    this.saleFormError.set('');
    try {
      const heard = await this.voice.listen();
      const sale = parseSpokenSale(heard);
      if (!sale) {
        this.saleFormError.set(`Escuché "${heard}", pero no un monto. Intenta con "veinte mil pesos".`);
        return;
      }
      this.fillSale(sale.amount, sale.description, `Escuché "${heard}". Revisa y genera el QR.`);
    } catch (err: unknown) {
      this.saleFormError.set((err as Error).message);
    }
  }

  /**
   * A sale asked of GlorIA: its QR is generated as if the shopkeeper had tapped "Generar QR", and
   * it shows on the counter display too. Resolves with what went wrong, or null.
   */
  protected readonly chargeFromGloria = async (sale: {
    amount: number;
    description: string;
  }): Promise<string | null> => {
    if (!this.canSell()) {
      return 'primero autoriza tu billetera en Inicio para poder cobrar.';
    }
    if (this.saleBusy()) return 'estoy generando otro cobro, intenta en un segundo.';
    if (this.currentSale()) this.resetSaleForm();
    this.selectTab('vender');
    this.fillSale(sale.amount, sale.description, '');
    await this.submitSale();
    return this.currentSale() ? null : this.saleFormError() || 'no se pudo crear el cobro.';
  };

  protected takeGloriaSection(section: GloriaSection): void {
    this.selectTab(section);
  }

  private fillSale(amount: number, description: string, hint: string): void {
    this.saleAmountInputVal.set(amount.toLocaleString('es-CO'));
    if (description) this.saleDescription = description.slice(0, 120);
    this.saleFormError.set('');
    this.saleHint.set(hint);
  }

  /**
   * Links a phone as the counter display (ADR 0018), or with `rotate` unlinks the one that had the
   * old link. The phone then shows every new sale's QR without scanning again.
   */
  protected async linkDisplay(rotate = false): Promise<void> {
    if (this.displayBusy()) return;
    this.displayBusy.set(true);
    this.displayMessage.set(null);
    try {
      await this.api.post(`${this.merchantPath}/display`, {});
      await this.loadMerchant();
      this.displayMessage.set({
        tone: 'ok',
        text: rotate
          ? 'Listo: el celular anterior quedó desconectado. Escanea el código nuevo con el que vas a usar.'
          : 'Escanea este código con tu celular y déjalo en el mostrador: mostrará cada cobro nuevo solo.',
      });
    } catch (err: unknown) {
      this.displayMessage.set({
        tone: 'bad',
        text: (err as Error)?.message || 'No pudimos enlazar la pantalla. Intenta de nuevo.',
      });
    } finally {
      this.displayBusy.set(false);
    }
  }

  /** Records the sale in the form as paid in cash: counted and split, its shares held in cash. */
  protected async submitCashSale(): Promise<void> {
    if (this.saleBusy()) return;
    const amount = normalizeDecimal(this.saleAmountInputVal());
    if (!amount || Number(amount) < MIN_SALE) {
      this.saleFormError.set(`Escribe un monto de al menos ${formatMoney(MIN_SALE, 'COP')}.`);
      return;
    }
    const problem = await this.recordCash(Number(amount), this.saleDescription.trim());
    if (problem) {
      this.saleFormError.set(problem);
      return;
    }
    this.saleAmountInputVal.set('');
    this.saleDescription = '';
  }

  /** Records a cash sale; resolves with what went wrong, or null. */
  private async recordCash(amount: number, description: string): Promise<string | null> {
    this.saleBusy.set(true);
    this.saleFormError.set('');
    try {
      await this.api.post(`${this.merchantPath}/cash-sales`, {
        amount: String(amount),
        ...(description && { description }),
      });
      await this.loadMerchant();
      const toDeposit = this.merchant()?.cash?.toDeposit;
      this.cashMessage.set({
        tone: 'ok',
        text: `Venta en efectivo de ${formatMoney(amount, 'COP')} registrada.${
          toDeposit && toNumber(toDeposit) > 0
            ? ` Por consignar para tus repartos: ${formatAmount(toDeposit)}.`
            : ''
        }`,
      });
      this.depositInput = toDeposit ? groupThousands(toDecimal(toDeposit)) : '';
      return null;
    } catch (err: unknown) {
      return (err as Error)?.message || 'No pudimos registrar la venta en efectivo.';
    } finally {
      this.saleBusy.set(false);
    }
  }

  /** The shopkeeper deposited cash: it releases the oldest shares held in cash. */
  protected async depositCash(): Promise<void> {
    const amount = normalizeDecimal(this.depositInput);
    if (!amount || Number(amount) <= 0) {
      this.cashMessage.set({ tone: 'bad', text: 'Escribe cuánto consignaste.' });
      return;
    }
    const result = await this.deposit(Number(amount));
    this.cashMessage.set({ tone: result.ok ? 'ok' : 'bad', text: result.text });
  }

  /** Records a deposit; the message says what it released and what is still in cash. */
  private async deposit(amount: number): Promise<{ ok: boolean; text: string }> {
    if (this.cashBusy()) return { ok: false, text: 'Ya estoy registrando una consignación.' };
    this.cashBusy.set(true);
    try {
      const r = await this.api.post<{
        sent: Amount;
        reserved: Amount;
        stillInCash: Amount;
        credit: Amount;
        paidNow: string[];
        failed: string[];
      }>(`${this.merchantPath}/cash-deposits`, { amount: String(amount) });
      await this.loadMerchant();
      this.depositInput = toNumber(r.stillInCash) > 0 ? groupThousands(toDecimal(r.stillInCash)) : '';
      const parts = [
        `Consignación de ${formatMoney(amount, 'COP')} registrada.`,
        toNumber(r.sent) > 0 ? `Enviado a tus ahorros: ${formatAmount(r.sent)}.` : '',
        toNumber(r.reserved) > 0 ? `Apartado para tus proveedores: ${formatAmount(r.reserved)}.` : '',
        r.paidNow.length ? `Pagado ya a ${r.paidNow.join(', ')}.` : '',
        r.failed.length ? `No se pudo enviar a ${r.failed.join(', ')}.` : '',
        toNumber(r.stillInCash) > 0
          ? `Falta por consignar: ${formatAmount(r.stillInCash)}.`
          : 'No queda nada por consignar.',
      ];
      return { ok: r.failed.length === 0, text: parts.filter(Boolean).join(' ') };
    } catch (err: unknown) {
      return { ok: false, text: (err as Error)?.message || 'No pudimos registrar la consignación.' };
    } finally {
      this.cashBusy.set(false);
    }
  }

  /** A cash sale asked of GlorIA ("vendí 15 mil en efectivo"). Resolves with what went wrong, or null. */
  protected readonly cashSaleFromGloria = async (sale: {
    amount: number;
    description: string;
  }): Promise<string | null> => this.recordCash(sale.amount, sale.description);

  /** A deposit told to GlorIA ("consigné 50 mil"): what it did, said back to the shopkeeper. */
  protected readonly depositFromGloria = (amount: number): Promise<{ ok: boolean; text: string }> =>
    this.deposit(amount);

  protected toggleAnnouncements(): void {
    this.voice.setAnnouncements(!this.voice.announcements());
  }

  protected tryVoice(): void {
    this.voice.chime();
    void this.voice.speak('¡Hola! Soy GlorIA. ¡Pago recibido! Veinte mil pesos. Así te aviso cada venta.');
  }

  private announceNewNotices(m: MerchantDashboard): void {
    const notices = m.notifications ?? [];
    if (!this.announcedNotices) {
      this.announcedNotices = new Set(notices.map((n) => n.id));
      return;
    }
    for (const notice of notices) {
      if (this.announcedNotices.has(notice.id)) continue;
      this.announcedNotices.add(notice.id);
      if (notice.kind === 'payout-failed') this.voice.announce(notice.title, true);
      if (notice.kind === 'payout-sent') this.voice.announce(notice.title, false);
    }
  }

  private isSaleFinal(sale: SaleView): boolean {
    if (sale.status === 'failed' || sale.status === 'cancelled') return true;
    return (
      sale.status === 'paid' &&
      ['done', 'skipped'].includes(sale.settlement?.status || '') &&
      !(sale.settlement?.items || []).some((item) => item.status === 'processing')
    );
  }

  private resumeLatestSale(m: MerchantDashboard): void {
    if (this.resumed) return;
    this.resumed = true;
    const latest = m.sales[0];
    if (!latest || this.isSaleFinal(latest) || this.currentSale()) return;
    if (Date.now() - Date.parse(latest.createdAt) > RESUME_WINDOW_MS) return;
    this.showSale(latest);
  }

  protected cobroUrl(sale: SaleView): string {
    const base = sale.checkoutUrl
      ? new URL(sale.checkoutUrl, window.location.origin).origin
      : window.location.origin;
    return `${base}/cobro?sale=${encodeURIComponent(sale.id)}`;
  }

  protected checkoutUrl(sale: SaleView): string {
    const fallback = `/pay?sale=${encodeURIComponent(sale.id)}`;
    return new URL(sale.checkoutUrl || fallback, window.location.origin).toString();
  }

  protected showSale(sale: SaleView, payUrl?: string): void {
    const fallback = `/pay?sale=${encodeURIComponent(sale.id)}`;
    const resolvedPayUrl = new URL(
      payUrl || sale.payUrl || fallback,
      window.location.origin,
    ).toString();
    this.currentSale.set({ sale, payUrl: resolvedPayUrl });
    this.startSalePolling();
  }

  protected openSaleFromHistory(sale: SaleView): void {
    this.selectTab('vender');
    this.showSale(sale);
  }

  protected resetSaleForm(): void {
    this.stopSalePolling();
    this.currentSale.set(null);
    this.saleAmountInputVal.set('');
    this.saleDescription = '';
    this.saleFormError.set('');
    this.saleHint.set('');
  }

  private stopSalePolling(): void {
    this.stopSalePoll?.();
    this.stopSalePoll = null;
  }

  private startSalePolling(): void {
    this.stopSalePolling();
    const cur = this.currentSale();
    if (!cur || this.isSaleFinal(cur.sale) || this.tab() !== 'vender') return;
    const saleId = cur.sale.id;
    const createdAt = cur.sale.createdAt;
    this.stopSalePoll = poll(
      async () => {
        const latestCur = this.currentSale();
        if (!latestCur || latestCur.sale.id !== saleId) return false;
        const sale = await this.api.get<SaleView>(
          `/api/sales/${encodeURIComponent(saleId)}`,
        );
        const nowCur = this.currentSale();
        if (!nowCur || nowCur.sale.id !== saleId) return false;
        const nextPayUrl = sale.payUrl
          ? new URL(sale.payUrl, window.location.origin).toString()
          : nowCur.payUrl;
        if (nowCur.sale.status !== 'paid' && sale.status === 'paid') {
          this.voice.announcePayment(toNumber(sale.amount));
        }
        this.currentSale.set({ sale, payUrl: nextPayUrl });
        if (this.isSaleFinal(sale)) {
          await this.loadMerchant();
          return false;
        }
        return true;
      },
      () => salePace(createdAt),
      this.destroyRef,
    );
  }

  protected waitingForCustomer(sale: SaleView): boolean {
    return (
      ['open', 'awaiting-consent'].includes(sale.status) || Boolean(sale.pending)
    );
  }

  protected settlementNote(sale: SaleView): string {
    const status = sale.settlement?.status;
    if (status === 'pending' || status === 'running') return 'Repartiendo tu venta…';
    if (status === 'skipped') return sale.settlement?.reason || 'Esta venta no se repartió.';
    return '';
  }

  protected async copyPayUrl(url: string): Promise<void> {
    const ok = await copyText(url);
    this.copyLabel.set(ok ? '¡Copiado!' : 'Cópialo a mano');
    setTimeout(() => this.copyLabel.set('Copiar'), 1800);
  }

  protected async submitSale(): Promise<void> {
    if (this.saleBusy() || !this.canSell()) return;
    this.saleFormError.set('');
    const amount = normalizeDecimal(this.saleAmountInputVal());
    if (!amount) {
      this.saleFormError.set('Escribe un monto válido, por ejemplo 10.000');
      return;
    }
    if (Number(amount) < MIN_SALE) {
      this.saleFormError.set(
        `El monto mínimo de una venta es ${formatMoney(MIN_SALE, 'COP')}.`,
      );
      return;
    }
    if (Number(amount) > MAX_SALE) {
      this.saleFormError.set(
        `El monto es demasiado grande: el máximo por venta es ${formatMoney(MAX_SALE, 'COP')}.`,
      );
      return;
    }
    const description = this.saleDescription.trim();
    this.saleBusy.set(true);
    try {
      const { sale, payUrl } = await this.api.post<{
        sale: SaleView;
        payUrl: string;
      }>(
        `${this.merchantPath}/sales`,
        description ? { amount, description } : { amount },
      );
      this.showSale(sale, payUrl);
      await this.loadMerchant();
    } catch (err: unknown) {
      this.saleFormError.set((err as Error)?.message || 'No pudimos crear el cobro.');
    } finally {
      this.saleBusy.set(false);
    }
  }

  // Repartos methods
  protected openRulesEditor(): void {
    const m = this.merchant();
    if (!m) return;
    this.ruleDrafts.set(
      m.rules.map((r) => ({
        key: nextRuleDraftKey++,
        id: r.id,
        storedOutstanding: normalizeDecimal(toDecimal(r.outstanding)),
        label: r.label,
        category: r.category || '',
        kind: r.kind,
        sharePercent: r.shareBps / 100,
        monthlyQuota: toDecimal(r.monthlyQuota),
        outstanding: toDecimal(r.outstanding),
        savingsGoal: toDecimal(r.savingsGoal),
        dueDay: r.dueDay ?? (r.kind === 'debt' ? 28 : null),
        destination: walletName(r.destination),
      })),
    );
    this.rulesError.set('');
    this.rulesSavedMsg.set('');
    this.editingRules.set(true);
  }

  protected addRuleDraft(): void {
    if (this.ruleDrafts().length >= MAX_RULES) return;
    this.ruleDrafts.update((list) => [
      ...list,
      {
        key: nextRuleDraftKey++,
        label: 'Proveedor',
        category: 'Proveedores',
        kind: 'debt',
        sharePercent: null,
        monthlyQuota: '',
        outstanding: '',
        savingsGoal: '',
        dueDay: 25,
        destination: '',
      },
    ]);
  }

  protected removeRuleDraft(key: number): void {
    if (this.ruleDrafts().length <= 1) return;
    this.ruleDrafts.update((list) => list.filter((d) => d.key !== key));
  }

  protected updateRuleDraft(key: number, patch: Partial<RuleDraft>): void {
    this.ruleDrafts.update((list) =>
      list.map((d) => {
        if (d.key !== key) return d;
        const updated = { ...d, ...patch };
        if (patch.kind === 'debt' && !updated.dueDay) {
          updated.dueDay = 28;
        }
        return updated;
      }),
    );
  }

  private collectRulesPayload(): Record<string, unknown>[] {
    const preview = this.rulesPreview();
    if (preview.overLimit) {
      throw new Error(
        `La suma de porcentajes no puede pasar de ${MAX_TOTAL_PERCENT}%.`,
      );
    }
    if (preview.overCap) {
      throw new Error(
        'Las cuotas del mes no pueden sumar más que tu límite mensual.',
      );
    }

    return this.ruleDrafts().map((d, index) => {
      const position = `Regla ${index + 1}`;
      const label = d.label.trim();
      const category = d.category.trim();
      const dest = d.destination.trim();
      const sharePercent =
        d.sharePercent !== null && Number.isFinite(Number(d.sharePercent))
          ? Math.round(Number(d.sharePercent) * 100) / 100
          : NaN;

      if (!label) throw new Error(`${position}: escribe un nombre`);
      if (!category) {
        throw new Error(`${position}: escribe su categoría, por ejemplo Proveedores`);
      }
      if (!dest) throw new Error(`${position}: escribe la billetera de destino`);
      if (
        !Number.isFinite(sharePercent) ||
        sharePercent < 0.01 ||
        sharePercent > MAX_TOTAL_PERCENT
      ) {
        throw new Error(
          `${position}: el porcentaje debe estar entre 0,01 y ${MAX_TOTAL_PERCENT}`,
        );
      }

      const monthlyQuota = d.kind === 'debt' ? normalizeDecimal(d.monthlyQuota) : '';
      const outstanding = d.kind === 'debt' ? normalizeDecimal(d.outstanding) : '';
      const savingsGoal = d.kind === 'savings' ? normalizeDecimal(d.savingsGoal) : '';

      if (d.kind === 'debt' && d.monthlyQuota.trim() && !monthlyQuota) {
        throw new Error(`${position}: revisa la cuota del mes, por ejemplo 200.000`);
      }
      if (d.kind === 'debt' && d.outstanding.trim() && !outstanding) {
        throw new Error(`${position}: revisa la deuda total, por ejemplo 200.000`);
      }
      if (d.kind === 'savings' && d.savingsGoal.trim() && !savingsGoal) {
        throw new Error(`${position}: revisa la meta de ahorro, por ejemplo 200.000`);
      }
      if (d.kind === 'debt' && !monthlyQuota) {
        throw new Error(`${position}: escribe la cuota del mes, por ejemplo 200.000`);
      }

      const untouched =
        Boolean(d.id) &&
        d.kind === 'debt' &&
        outstanding === (d.storedOutstanding ?? '');

      const body: Record<string, unknown> = {
        label,
        category,
        kind: d.kind,
        destination: normalizeWallet(dest),
        sharePercent,
      };
      if (d.id) body['id'] = d.id;
      if (d.kind === 'debt') {
        const dueDay = d.dueDay !== null ? Number(d.dueDay) : NaN;
        if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
          throw new Error(`${position}: el día de pago va del 1 al 28`);
        }
        body['monthlyQuota'] = monthlyQuota;
        body['dueDay'] = dueDay;
      }
      if (d.kind === 'savings' && savingsGoal) {
        body['savingsGoal'] = savingsGoal;
      }
      if (d.kind === 'debt' && !untouched && outstanding) {
        body['outstanding'] = outstanding;
      }
      return body;
    });
  }

  protected async saveRules(): Promise<void> {
    if (this.rulesSaving()) return;
    this.rulesError.set('');
    let rules: Record<string, unknown>[];
    try {
      rules = this.collectRulesPayload();
    } catch (err: unknown) {
      this.rulesError.set((err as Error)?.message || 'Revisa los repartos.');
      return;
    }

    this.rulesSaving.set(true);
    try {
      await this.api.put(`${this.merchantPath}/rules`, { rules });
      this.editingRules.set(false);
      this.rulesSavedMsg.set('Listo: tus próximas ventas se reparten así.');
      await this.loadMerchant();
    } catch (err: unknown) {
      this.rulesError.set((err as Error)?.message || 'No pudimos guardar los repartos.');
    } finally {
      this.rulesSaving.set(false);
    }
  }

  protected async runManualPayout(ruleId: string): Promise<void> {
    await this.executePayout({ ruleId, reason: 'manual' }, this.payoutMessage);
  }

  protected async simulateDueDate(): Promise<void> {
    await this.executePayout({ reason: 'due-date' }, this.simulateMessage);
  }

  private async executePayout(
    body: Record<string, unknown>,
    targetSignal: typeof this.payoutMessage,
  ): Promise<void> {
    if (this.payoutBusy()) return;
    targetSignal.set(null);
    this.payoutBusy.set(true);
    try {
      const { payouts } = await this.api.post<{ payouts: PayoutView[] }>(
        `${this.merchantPath}/payouts`,
        body,
      );
      const sent = payouts.filter((p) => p.status !== 'failed');
      const failed = payouts.filter((p) => p.status === 'failed');
      const text = [
        sent.length
          ? `Enviado: ${sent.map((p) => `${p.label} ${formatAmount(p.amount)}`).join(' · ')}.`
          : '',
        failed.length
          ? `No se pudo enviar a ${failed.map((p) => p.label).join(', ')}: el dinero sigue apartado.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      targetSignal.set({
        text: text || 'No había pagos pendientes por enviar.',
        tone: failed.length ? 'bad' : 'ok',
      });
      await this.loadMerchant();
    } catch (err: unknown) {
      targetSignal.set({
        text: (err as Error)?.message || 'Error al enviar el pago.',
        tone: 'bad',
      });
    } finally {
      this.payoutBusy.set(false);
    }
  }

  // Avisos methods
  private readSeenNotices(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.seenNotices) || '[]'));
    } catch {
      return new Set();
    }
  }

  private markNoticesSeen(ids: string[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.seenNotices, JSON.stringify(ids));
      this.seenIds.set(new Set(ids));
    } catch {
      // Ignore storage errors
    }
  }

  protected noticeBadgeClass(tone: string): string {
    const map: Record<string, string> = {
      bad: 'badge-bad',
      wait: 'badge-wait',
      info: 'badge-info',
      ok: 'badge-ok',
    };
    return map[tone] || '';
  }

  protected noticeKindLabel(kind: string): string {
    const map: Record<string, string> = {
      'payout-failed': 'Revisar',
      'payout-due': 'Próximo pago',
      'payout-sent': 'Pagado',
      consent: 'Autorización',
      'cap-pending': 'Límite',
    };
    return map[kind] || '';
  }

  protected setNoticeConfirm(
    noticeId: string,
    mode: 'mark-paid' | 'use-emergency' | null,
  ): void {
    this.confirmingNotice.update((prev) => ({ ...prev, [noticeId]: mode }));
  }

  protected async resolveNoticePayout(
    noticeId: string,
    payoutId: string,
    action: 'retry' | 'mark-paid' | 'use-emergency',
    okText: string,
  ): Promise<void> {
    if (this.noticeBusy()) return;
    this.noticeMessage.set(null);
    this.noticeBusy.set(true);
    try {
      const payout = await this.api.post<PayoutView>(
        `${this.merchantPath}/payouts/${encodeURIComponent(payoutId)}/${action}`,
        {},
      );
      this.setNoticeConfirm(noticeId, null);
      this.noticeMessage.set({
        text:
          payout.status === 'failed'
            ? 'El pago volvió a fallar: revisa el saldo de tu billetera y el límite mensual.'
            : okText,
        tone: payout.status === 'failed' ? 'bad' : 'ok',
      });
      await this.loadMerchant();
    } catch (err: unknown) {
      this.noticeMessage.set({
        text: (err as Error)?.message || 'Error al procesar el pago.',
        tone: 'bad',
      });
    } finally {
      this.noticeBusy.set(false);
    }
  }

  // Ajustes methods
  protected onSalesGoalInput(raw: string): void {
    this.salesGoalInput = formatThousandsInput(raw);
  }

  protected onCapNewInput(raw: string): void {
    this.capNewInput = formatThousandsInput(raw);
  }

  private async saveSettings(
    body: Record<string, unknown>,
    targetSignal: typeof this.shopMessage,
    okText: string,
  ): Promise<void> {
    if (this.settingsBusy()) return;
    targetSignal.set(null);
    this.settingsBusy.set(true);
    try {
      await this.api.put(`${this.merchantPath}/settings`, body);
      this.settingsFilled = false;
      await this.loadMerchant();
      targetSignal.set({ text: okText, tone: 'ok' });
    } catch (err: unknown) {
      targetSignal.set({
        text: (err as Error)?.message || 'Error al guardar.',
        tone: 'bad',
      });
    } finally {
      this.settingsBusy.set(false);
    }
  }

  protected async saveShopName(): Promise<void> {
    const name = this.shopNameInput.trim();
    if (!name) {
      this.shopMessage.set({ text: 'Escribe el nombre de tu negocio.', tone: 'bad' });
      return;
    }
    await this.saveSettings({ name }, this.shopMessage, 'Nombre guardado.');
  }

  protected async saveSalesGoal(): Promise<void> {
    const goal = normalizeDecimal(this.salesGoalInput);
    if (!goal) {
      this.goalMessage.set({
        text: 'Escribe tu meta, por ejemplo 3.000.000.',
        tone: 'bad',
      });
      return;
    }
    await this.saveSettings(
      { monthlySalesGoal: goal },
      this.goalMessage,
      'Meta guardada.',
    );
    if (this.goalMessage()?.tone === 'ok') {
      this.editingSalesGoal.set(false);
    }
  }

  protected async clearSalesGoal(): Promise<void> {
    await this.saveSettings(
      { monthlySalesGoal: null },
      this.goalMessage,
      'Meta quitada.',
    );
    if (this.goalMessage()?.tone === 'ok') {
      this.editingSalesGoal.set(false);
    }
  }

  protected async saveNewCap(): Promise<void> {
    if (this.settingsBusy()) return;
    this.capMessage.set(null);
    const monthlyCap = normalizeDecimal(this.capNewInput);
    if (!monthlyCap) {
      this.capMessage.set({
        text: 'Escribe el nuevo límite, por ejemplo 500.000.',
        tone: 'bad',
      });
      return;
    }
    this.settingsBusy.set(true);
    try {
      const { redirectUrl } = await this.api.post<{ redirectUrl: string }>(
        `${this.merchantPath}/cap`,
        { monthlyCap },
      );
      window.location.href = redirectUrl;
    } catch (err: unknown) {
      this.capMessage.set({
        text: (err as Error)?.message || 'No pudimos actualizar el límite.',
        tone: 'bad',
      });
    } finally {
      this.settingsBusy.set(false);
    }
  }

  protected async authorizeEmergency(): Promise<void> {
    if (this.settingsBusy()) return;
    this.emergencyMessage.set(null);
    const showPicker =
      this.savingsRules().length >= 2 &&
      this.merchant()?.emergency?.status !== 'active';
    const ruleId = showPicker ? this.emergencyPickId : undefined;
    this.settingsBusy.set(true);
    try {
      const { redirectUrl } = await this.api.post<{ redirectUrl: string }>(
        `${this.merchantPath}/emergency`,
        ruleId ? { ruleId } : {},
      );
      window.location.href = redirectUrl;
    } catch (err: unknown) {
      this.emergencyMessage.set({
        text: (err as Error)?.message || 'No pudimos autorizar el fondo.',
        tone: 'bad',
      });
    } finally {
      this.settingsBusy.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.api.logout();
  }

  protected formatShortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
    });
  }

  protected formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-CO', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
