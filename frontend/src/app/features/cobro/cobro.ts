import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { SaleView } from '../../core/miplante.models';
import {
  SALE_STATUS,
  badgeClass,
  formatAmount,
  formatTime,
  poll,
  salePace,
  statusInfo,
} from '../../core/miplante.utils';
import { VoiceService } from '../../core/voice.service';
import { Doodle } from '../../shared/brand/doodle';
import { Logo } from '../../shared/brand/logo';
import { QrCode } from '../../shared/ui/qr-code';

/** How often the counter display looks for a new sale: often while one waits, calmer when idle. */
const DISPLAY_ACTIVE_MS = 1500;
const DISPLAY_IDLE_MS = 2500;

interface WakeLockLike {
  release(): Promise<void>;
}

/**
 * The counter screen. With `?sale=` it shows one sale. With `?pantalla=` it is the shop's counter
 * display (ADR 0018): a phone that keeps showing the newest sale's QR, whether the shopkeeper or
 * GlorIA made it, celebrates each payment and then waits for the next one.
 */
@Component({
  selector: 'app-cobro',
  imports: [RouterLink, QrCode, Logo, Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page cobro-page' },
  template: `
    <main class="cobro" aria-live="polite">
      <div class="row between">
        <a routerLink="/" aria-label="MiPlante" style="width: 118px; display: block">
          <app-logo />
        </a>
        @if (displayKey) {
          <span class="header-pill" aria-label="Pantalla de cobro conectada">● En línea</span>
        } @else {
          <a class="header-pill" routerLink="/merchant">← Volver a mi caja</a>
        }
      </div>

      @if (missing()) {
        <section class="card cobro-card stack">
          <div class="row between">
            <div class="stack-sm">
              @if (displayKey) {
                <p class="eyebrow">Pantalla desconectada</p>
                <h1 class="h1-sm">Esta pantalla ya no está enlazada</h1>
                <p class="muted">
                  Desde tu caja, en Vender o Ajustes, escanea de nuevo el código de la pantalla de cobro.
                </p>
              } @else {
                <p class="eyebrow">Cobro no disponible</p>
                <h1 class="h1-sm">No encontramos este cobro</h1>
                <p class="muted">
                  Revisa el enlace o genera el cobro de nuevo desde tu caja.
                </p>
              }
            </div>
            <span class="doodle-badge" aria-hidden="true">
              <app-doodle name="duda" />
            </span>
          </div>
          @if (!displayKey) {
            <a class="btn btn-lima btn-block" routerLink="/merchant">Ir a mi caja</a>
          }
        </section>
      }

      @if (displayKey && !sale() && !missing()) {
        <section class="card cobro-card stack cobro-idle">
          <div class="row between">
            <div class="stack-sm">
              <p class="eyebrow">Pantalla de cobro</p>
              <h1 class="h1-sm">{{ shopName() || 'MiPlante' }}</h1>
              <p class="muted">
                Esperando el próximo cobro. Aquí aparecerá el código para pagar, solo.
              </p>
            </div>
            <span class="doodle-badge" aria-hidden="true">
              <app-doodle name="planta" />
            </span>
          </div>
        </section>
      }

      @if (sale(); as s) {
        <section class="card cobro-card">
          <header class="cobro-head">
            <div>
              <p class="eyebrow">Cobro en mostrador</p>
              <h2>{{ s.merchantName || shopName() || 'MiPlante' }}</h2>
            </div>
            <span [class]="statusBadgeClass(s.status)">{{ statusText(s.status) }}</span>
          </header>

          <div class="cobro-amount stack-sm">
            <p class="amount-xl">
              {{ formatAmount(s.status === 'paid' ? s.amount : s.pending || s.amount) }}
            </p>
            @if (s.description) {
              <p class="muted center">{{ s.description }}</p>
            }
          </div>

          @if (waiting(s) && s.payUrl) {
            <div class="cobro-qr">
              <div class="qr-box">
                <app-qr-code
                  [value]="s.payUrl"
                  [size]="310"
                  fallback="Pide al negocio el enlace de pago."
                />
                <p class="small center">
                  <strong>
                    {{
                      s.pending
                        ? 'Escanea de nuevo y confirma los ' + formatAmount(s.pending) + ' que faltan'
                        : 'Escanea con tu celular y confirma en tu billetera'
                    }}
                  </strong>
                </p>
              </div>
            </div>

            <a
              class="btn btn-lima btn-block"
              routerLink="/pay"
              [queryParams]="{ sale: s.id }"
            >
              Pagar desde este navegador →
            </a>
          }

          @if (s.pending) {
            <p class="banner banner-wait" role="status">
              Llegaron {{ formatAmount(s.payment?.receivedAmount) }} de {{ formatAmount(s.amount) }}.
            </p>
          }

          @if (s.status === 'paid') {
            <div class="success cobro-done">
              <span class="success-icon" aria-hidden="true">✓</span>
              <p class="success-title">¡Pago recibido!</p>
              <p class="small">
                {{
                  s.paidAt
                    ? 'Pagado a las ' + formatTime(s.paidAt) + '. ¡Gracias por tu compra!'
                    : '¡Gracias por tu compra!'
                }}
              </p>
            </div>
          }

          @if (s.status === 'failed') {
            <p class="banner banner-bad" role="alert">
              Este cobro no se completó. Pide al negocio que genere uno nuevo.
            </p>
          }
        </section>
      }

      <p class="muted small center cobro-foot">
        Pago con Open Payments sobre la red Interledger.
      </p>
    </main>
  `,
})
export default class CobroPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly voice = inject(VoiceService);

  protected readonly formatAmount = formatAmount;
  protected readonly formatTime = formatTime;

  protected readonly sale = signal<SaleView | null>(null);
  protected readonly missing = signal(false);
  protected readonly shopName = signal('');

  protected displayKey = '';
  private saleId = '';
  private wakeLock: WakeLockLike | null = null;

  ngOnInit(): void {
    this.title.setTitle('Cobro · MiPlante');
    const params = this.route.snapshot.queryParamMap;
    this.displayKey = params.get('pantalla') || '';
    this.saleId = params.get('sale') || '';

    if (this.displayKey) {
      this.keepScreenOn();
      poll(
        () => this.refreshDisplay(),
        () => (this.sale() ? DISPLAY_ACTIVE_MS : DISPLAY_IDLE_MS),
        this.destroyRef,
      );
      return;
    }

    if (!this.saleId) {
      this.missing.set(true);
      return;
    }

    poll(
      () => this.refresh(),
      () => {
        const s = this.sale();
        return s ? salePace(s.createdAt) : 1000;
      },
      this.destroyRef,
    );
  }

  protected statusText(status: string): string {
    return statusInfo(SALE_STATUS, status).text;
  }

  protected statusBadgeClass(status: string): string {
    return badgeClass(statusInfo(SALE_STATUS, status).tone);
  }

  protected waiting(s: SaleView): boolean {
    return ['open', 'awaiting-consent'].includes(s.status) || Boolean(s.pending);
  }

  private async refresh(): Promise<boolean> {
    try {
      const s = await this.api.get<SaleView>(`/api/sales/${encodeURIComponent(this.saleId)}`);
      this.missing.set(false);
      this.sale.set(s);
      this.title.setTitle(`${formatAmount(s.amount)} · ${s.merchantName || 'MiPlante'}`);
      return s.status !== 'paid' && s.status !== 'failed';
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr?.status === 404 || apiErr?.status === 400) {
        this.missing.set(true);
        this.sale.set(null);
        return false;
      }
      throw err;
    }
  }

  /** The newest sale of the shop, or none; keeps looking until the display is unlinked. */
  private async refreshDisplay(): Promise<boolean> {
    try {
      const { shopName, sale } = await this.api.get<{ shopName: string; sale: SaleView | null }>(
        `/api/displays/${encodeURIComponent(this.displayKey)}`,
      );
      const before = this.sale();
      if (sale?.status === 'paid' && before?.id === sale.id && before.status !== 'paid') {
        // The customer sees the payment land: a chime and a buzz where the phone allows it.
        this.voice.chime();
        navigator.vibrate?.([80, 60, 120]);
      }
      this.missing.set(false);
      this.shopName.set(shopName);
      this.sale.set(sale);
      this.title.setTitle(sale ? `${formatAmount(sale.amount)} · ${shopName}` : `Pantalla de cobro · ${shopName}`);
      return true;
    } catch (err: unknown) {
      if ((err as ApiError)?.status === 404) {
        this.missing.set(true);
        this.sale.set(null);
        return false;
      }
      // A dropped connection: keep showing what was there and try again.
      return true;
    }
  }

  /** A counter display should not fall asleep between customers; ignored where unsupported. */
  private keepScreenOn(): void {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockLike> };
    };
    if (!nav.wakeLock) return;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!
        .request('screen')
        .then((lock) => (this.wakeLock = lock))
        .catch(() => undefined);
    };
    request();
    // The browser drops the lock when the tab hides; take it again on return.
    document.addEventListener('visibilitychange', request);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', request);
      void this.wakeLock?.release().catch(() => undefined);
    });
  }
}
