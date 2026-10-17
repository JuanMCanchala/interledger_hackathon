import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import {
  Amount,
  MeResponse,
  MerchantDashboard,
  SaleView,
  Tone,
  UserView,
} from '../../core/miplante.models';
import {
  STORAGE_KEYS,
  formatAmount,
  formatMoney,
  poll,
  toNumber,
  walletName,
} from '../../core/miplante.utils';
import { VoiceService } from '../../core/voice.service';
import { Logo } from '../../shared/brand/logo';
import { InstallApp } from '../../shared/ui/install-app';
import { Gloria, GloriaSection } from '../gloria/gloria';
import { BannerMessage, TABS, TabName } from './merchant.types';
import { MerchantAjustes } from './sections/merchant-ajustes';
import { MerchantAvisos } from './sections/merchant-avisos';
import { MerchantEfectivo } from './sections/merchant-efectivo';
import { MerchantInicio } from './sections/merchant-inicio';
import { MerchantMetas } from './sections/merchant-metas';
import { MerchantRepartos } from './sections/merchant-repartos';
import { MerchantVender } from './sections/merchant-vender';

const RESUME_WINDOW_MS = 10 * 60 * 1000;
const BUSY_REFRESH_MS = 5_000;
const IDLE_REFRESH_MS = 30_000;

@Component({
  selector: 'app-merchant',
  imports: [
    RouterLink,
    Logo,
    Gloria,
    InstallApp,
    MerchantInicio,
    MerchantVender,
    MerchantEfectivo,
    MerchantMetas,
    MerchantRepartos,
    MerchantAvisos,
    MerchantAjustes,
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
  protected readonly toNumber = toNumber;
  protected readonly walletName = walletName;

  protected readonly todayDateText = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  protected readonly tab = signal<TabName>('inicio');
  protected readonly merchant = signal<MerchantDashboard | null>(null);
  protected readonly account = signal<UserView | null>(null);
  protected readonly missingText = signal('');
  protected readonly loadError = signal('');
  protected readonly consentBusy = signal(false);

  // Cross-section coordination state (passed via inputs/outputs, no store)
  protected readonly sellMode = signal<'qr' | 'cash'>('qr');
  protected readonly selectedSale = signal<SaleView | null>(null);
  protected readonly pendingCharge = signal<{
    amount: number;
    description: string;
    resolve: (err: string | null) => void;
  } | null>(null);
  protected readonly startRepartosInEditor = signal(false);
  protected readonly externalCashMessage = signal<BannerMessage | null>(null);

  protected readonly seenIds = signal<Set<string>>(this.readSeenNotices());

  protected merchantId = '';
  protected merchantPath = '';
  private resumed = false;
  /** Notices already known on this screen: only the ones arriving later are said out loud. */
  private announcedNotices: Set<string> | null = null;

  protected readonly unseenCount = computed(() => {
    const notices = this.merchant()?.notifications ?? [];
    const seen = this.seenIds();
    return notices.filter((n) => !seen.has(n.id)).length;
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
    window.scrollTo({ top: 0 });
  }

  protected onSellModeChange(mode: 'qr' | 'cash'): void {
    this.sellMode.set(mode);
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

  protected openSaleInVender(sale: SaleView): void {
    this.selectedSale.set(sale);
    this.selectTab('vender');
  }

  protected openCashSaleInVender(): void {
    this.onSellModeChange('cash');
    this.selectTab('vender');
  }

  protected openSavingsEditorInRepartos(): void {
    this.startRepartosInEditor.set(true);
    this.selectTab('repartos');
  }

  private isBusy(): boolean {
    const cur = this.selectedSale();
    if (cur && !this.isSaleFinal(cur)) return true;
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

  protected async loadMerchant(): Promise<boolean> {
    try {
      const m = await this.api.get<MerchantDashboard>(this.merchantPath);
      this.loadError.set('');
      this.missingText.set('');
      this.merchant.set(m);
      this.title.setTitle(`${m.name} · MiPlante`);
      this.announceNewNotices(m);

      if (this.tab() === 'avisos') {
        this.markNoticesSeen((m.notifications ?? []).map((n) => n.id));
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

  protected readonly chargeFromGloria = (sale: {
    amount: number;
    description: string;
  }): Promise<string | null> => {
    if (this.merchant()?.status !== 'active') {
      return Promise.resolve('primero autoriza tu billetera en Inicio para poder cobrar.');
    }
    this.selectTab('vender');
    return new Promise<string | null>((resolve) => {
      this.pendingCharge.set({
        amount: sale.amount,
        description: sale.description,
        resolve,
      });
    });
  };

  protected onChargeHandled(error: string | null): void {
    const req = this.pendingCharge();
    if (req) {
      this.pendingCharge.set(null);
      req.resolve(error);
    }
  }

  protected readonly cashSaleFromGloria = async (sale: {
    amount: number;
    description: string;
  }): Promise<string | null> => {
    try {
      await this.api.post(`${this.merchantPath}/cash-sales`, {
        amount: String(sale.amount),
        ...(sale.description && { description: sale.description }),
      });
      await this.loadMerchant();
      const toDeposit = this.merchant()?.cash?.toDeposit;
      this.externalCashMessage.set({
        tone: 'ok',
        text: `Venta en efectivo de ${formatMoney(sale.amount, 'COP')} registrada.${
          toDeposit && toNumber(toDeposit) > 0
            ? ` Por consignar para tus repartos: ${formatAmount(toDeposit)}.`
            : ''
        }`,
      });
      return null;
    } catch (err: unknown) {
      return (err as Error)?.message || 'No pudimos registrar la venta en efectivo.';
    }
  };

  protected readonly depositFromGloria = async (
    amount: number,
  ): Promise<{ ok: boolean; text: string }> => {
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
      const text = parts.filter(Boolean).join(' ');
      const ok = r.failed.length === 0;
      this.externalCashMessage.set({ tone: ok ? 'ok' : 'bad', text });
      return { ok, text };
    } catch (err: unknown) {
      return {
        ok: false,
        text: (err as Error)?.message || 'No pudimos registrar la consignación.',
      };
    }
  };

  protected takeGloriaSection(section: GloriaSection): void {
    this.selectTab(section);
  }

  protected async logout(): Promise<void> {
    await this.api.logout();
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
    if (!latest || this.isSaleFinal(latest) || this.selectedSale()) return;
    if (Date.now() - Date.parse(latest.createdAt) > RESUME_WINDOW_MS) return;
    this.selectedSale.set(latest);
  }

  private readSeenNotices(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.seenNotices);
      const parsed = JSON.parse(raw || '[]');
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  private markNoticesSeen(ids: string[]): void {
    if (!ids.length) return;
    const next = new Set(this.seenIds());
    ids.forEach((id) => next.add(id));
    this.seenIds.set(next);
    try {
      localStorage.setItem(STORAGE_KEYS.seenNotices, JSON.stringify([...next].slice(-200)));
    } catch {
      // Storage full or blocked
    }
  }
}
