import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/api.service';
import { MerchantDashboard, SaleView } from '../../../core/miplante.models';
import {
  SALE_STATUS,
  badgeClass,
  copyText,
  formatAmount,
  formatMoney,
  formatThousandsInput,
  formatTime,
  normalizeDecimal,
  poll,
  previewSplit,
  salePace,
  statusInfo,
  toMinor,
  toNumber,
} from '../../../core/miplante.utils';
import { parseSpokenSale } from '../../../core/spoken-amount';
import { VoiceService } from '../../../core/voice.service';
import { QrCode } from '../../../shared/ui/qr-code';
import { SplitList } from '../../../shared/ui/split-list';
import { BannerMessage } from '../merchant.types';

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000, 100000];
const MIN_SALE = 100;
const MAX_SALE = 100_000_000;

@Component({
  selector: 'app-merchant-vender',
  imports: [FormsModule, QrCode, SplitList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './merchant-vender.html',
})
export class MerchantVender implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly voice = inject(VoiceService);

  readonly merchant = input.required<MerchantDashboard>();
  readonly merchantPath = input.required<string>();
  readonly initialSellMode = input<'qr' | 'cash'>('qr');
  readonly initialSale = input<SaleView | null>(null);
  readonly pendingCharge = input<{ amount: number; description: string } | null>(null);

  readonly refresh = output<void>();
  readonly sellModeChange = output<'qr' | 'cash'>();
  readonly activeSaleChange = output<SaleView | null>();
  readonly chargeHandled = output<string | null>();

  protected readonly formatAmount = formatAmount;
  protected readonly formatMoney = formatMoney;
  protected readonly formatTime = formatTime;
  protected readonly toNumber = toNumber;
  protected readonly quickAmounts = QUICK_AMOUNTS;

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
  protected readonly saleHint = signal('');
  protected readonly sellMode = signal<'qr' | 'cash'>('qr');
  protected readonly cashMessage = signal<BannerMessage | null>(null);
  protected readonly displayBusy = signal(false);
  protected readonly displayMessage = signal<BannerMessage | null>(null);

  private stopSalePoll: (() => void) | null = null;

  protected readonly canSell = computed(() => this.merchant().status === 'active');

  protected readonly liveSalePreview = computed(() => {
    const m = this.merchant();
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

  constructor() {
    effect(() => {
      const mode = this.initialSellMode();
      untracked(() => {
        if (this.sellMode() !== mode) {
          this.sellMode.set(mode);
        }
      });
    });

    effect(() => {
      const sale = this.initialSale();
      untracked(() => {
        if (sale && this.currentSale()?.sale.id !== sale.id) {
          this.showSale(sale);
        }
      });
    });

    effect(() => {
      const req = this.pendingCharge();
      if (!req) return;
      untracked(() => {
        void this.executeGloriaCharge(req);
      });
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stopSalePolling());
  }

  protected setSellMode(mode: 'qr' | 'cash'): void {
    this.sellMode.set(mode);
    this.saleFormError.set('');
    this.sellModeChange.emit(mode);
  }

  protected isQuickAmountSelected(q: number): boolean {
    return normalizeDecimal(this.saleAmountInputVal()) === String(q);
  }

  protected onSaleAmountInput(raw: string): void {
    this.saleAmountInputVal.set(formatThousandsInput(raw));
    this.saleFormError.set('');
  }

  protected pickQuickAmount(val: number): void {
    this.saleAmountInputVal.set(val.toLocaleString('es-CO'));
    this.saleFormError.set('');
  }

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
        this.saleFormError.set(
          `Escuché "${heard}", pero no un monto. Intenta con "veinte mil pesos".`,
        );
        return;
      }
      this.fillSale(sale.amount, sale.description, `Escuché "${heard}". Revisa y genera el QR.`);
    } catch (err: unknown) {
      this.saleFormError.set((err as Error).message);
    }
  }

  private fillSale(amount: number, description: string, hint: string): void {
    this.saleAmountInputVal.set(amount.toLocaleString('es-CO'));
    if (description) this.saleDescription = description.slice(0, 120);
    this.saleFormError.set('');
    this.saleHint.set(hint);
  }

  private async executeGloriaCharge(sale: { amount: number; description: string }): Promise<void> {
    if (!this.canSell()) {
      this.chargeHandled.emit('primero autoriza tu billetera en Inicio para poder cobrar.');
      return;
    }
    if (this.saleBusy()) {
      this.chargeHandled.emit('estoy generando otro cobro, intenta en un segundo.');
      return;
    }
    if (this.currentSale()) this.resetSaleForm();
    this.fillSale(sale.amount, sale.description, '');
    await this.submitSale();
    this.chargeHandled.emit(
      this.currentSale() ? null : this.saleFormError() || 'no se pudo crear el cobro.',
    );
  }

  protected async linkDisplay(): Promise<void> {
    if (this.displayBusy()) return;
    this.displayBusy.set(true);
    this.displayMessage.set(null);
    try {
      await this.api.post(`${this.merchantPath()}/display`, {});
      this.refresh.emit();
      this.displayMessage.set({
        tone: 'ok',
        text: 'Escanea este código con tu celular y déjalo en el mostrador: mostrará cada cobro nuevo solo.',
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

  protected async submitCashSale(): Promise<void> {
    if (this.saleBusy()) return;
    const amount = normalizeDecimal(this.saleAmountInputVal());
    if (!amount || Number(amount) < MIN_SALE) {
      this.saleFormError.set(`Escribe un monto de al menos ${formatMoney(MIN_SALE, 'COP')}.`);
      return;
    }
    this.saleBusy.set(true);
    this.saleFormError.set('');
    try {
      const desc = this.saleDescription.trim();
      await this.api.post(`${this.merchantPath()}/cash-sales`, {
        amount: String(Number(amount)),
        ...(desc && { description: desc }),
      });
      this.saleAmountInputVal.set('');
      this.saleDescription = '';
      this.refresh.emit();
      this.cashMessage.set({
        tone: 'ok',
        text: `Venta en efectivo de ${formatMoney(Number(amount), 'COP')} registrada.`,
      });
    } catch (err: unknown) {
      this.saleFormError.set(
        (err as Error)?.message || 'No pudimos registrar la venta en efectivo.',
      );
    } finally {
      this.saleBusy.set(false);
    }
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
        `${this.merchantPath()}/sales`,
        description ? { amount, description } : { amount },
      );
      this.showSale(sale, payUrl);
      this.refresh.emit();
    } catch (err: unknown) {
      this.saleFormError.set((err as Error)?.message || 'No pudimos crear el cobro.');
    } finally {
      this.saleBusy.set(false);
    }
  }

  protected showSale(sale: SaleView, payUrl?: string): void {
    const fallback = `/pay?sale=${encodeURIComponent(sale.id)}`;
    const resolvedPayUrl = new URL(
      payUrl || sale.payUrl || fallback,
      window.location.origin,
    ).toString();
    this.currentSale.set({ sale, payUrl: resolvedPayUrl });
    this.activeSaleChange.emit(sale);
    this.startSalePolling();
  }

  protected resetSaleForm(): void {
    this.stopSalePolling();
    this.currentSale.set(null);
    this.activeSaleChange.emit(null);
    this.saleAmountInputVal.set('');
    this.saleDescription = '';
    this.saleFormError.set('');
    this.saleHint.set('');
  }

  private isSaleFinal(sale: SaleView): boolean {
    if (sale.status === 'failed' || sale.status === 'cancelled') return true;
    return (
      sale.status === 'paid' &&
      ['done', 'skipped'].includes(sale.settlement?.status || '') &&
      !(sale.settlement?.items || []).some((item) => item.status === 'processing')
    );
  }

  private stopSalePolling(): void {
    this.stopSalePoll?.();
    this.stopSalePoll = null;
  }

  private startSalePolling(): void {
    this.stopSalePolling();
    const cur = this.currentSale();
    if (!cur || this.isSaleFinal(cur.sale)) return;
    const saleId = cur.sale.id;
    const createdAt = cur.sale.createdAt;
    this.stopSalePoll = poll(
      async () => {
        const latestCur = this.currentSale();
        if (!latestCur || latestCur.sale.id !== saleId) return false;
        const sale = await this.api.get<SaleView>(`/api/sales/${encodeURIComponent(saleId)}`);
        const nowCur = this.currentSale();
        if (!nowCur || nowCur.sale.id !== saleId) return false;
        const nextPayUrl = sale.payUrl
          ? new URL(sale.payUrl, window.location.origin).toString()
          : nowCur.payUrl;
        if (nowCur.sale.status !== 'paid' && sale.status === 'paid') {
          this.voice.announcePayment(toNumber(sale.amount));
        }
        this.currentSale.set({ sale, payUrl: nextPayUrl });
        this.activeSaleChange.emit(sale);
        if (this.isSaleFinal(sale)) {
          this.refresh.emit();
          return false;
        }
        return true;
      },
      () => salePace(createdAt),
      this.destroyRef,
    );
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

  protected waitingForCustomer(sale: SaleView): boolean {
    return ['open', 'awaiting-consent'].includes(sale.status) || Boolean(sale.pending);
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

  protected saleStatusText(status: string): string {
    return statusInfo(SALE_STATUS, status).text;
  }

  protected saleStatusBadgeClass(status: string): string {
    return badgeClass(statusInfo(SALE_STATUS, status).tone);
  }
}
