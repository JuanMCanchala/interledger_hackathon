import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
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
import { QrCode } from '../../shared/ui/qr-code';

@Component({
  selector: 'app-cobro',
  imports: [QrCode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page cobro-page' },
  template: `
    <main class="cobro" aria-live="polite">
      @if (missing()) {
        <section class="card cobro-card stack">
          <h1 class="h1-sm">No encontramos este cobro</h1>
          <p class="muted">
            Revisa el enlace o genera el cobro de nuevo desde tu caja.
          </p>
        </section>
      }

      @if (sale(); as s) {
        <section class="card cobro-card">
          <header class="cobro-head">
            <p class="eyebrow">{{ s.merchantName || 'MiPlante' }}</p>
            <span>
              <span [class]="statusBadgeClass(s.status)">{{ statusText(s.status) }}</span>
            </span>
          </header>

          <p class="cobro-amount amount-xl">
            {{ formatAmount(s.status === 'paid' ? s.amount : s.pending || s.amount) }}
          </p>
          @if (s.description) {
            <p class="muted center">{{ s.description }}</p>
          }

          @if (waiting(s) && s.payUrl) {
            <div class="cobro-qr">
              <div class="qr-box">
                <app-qr-code
                  [value]="s.payUrl"
                  [size]="320"
                  fallback="Pide al negocio el enlace de pago."
                />
                <p class="small center">
                  {{
                    s.pending
                      ? 'Escanea de nuevo y confirma los ' + formatAmount(s.pending) + ' que faltan'
                      : 'Escanea con tu celular y confirma en tu billetera'
                  }}
                </p>
              </div>
            </div>
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
              <p class="muted small">
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

  protected readonly formatAmount = formatAmount;
  protected readonly formatTime = formatTime;

  protected readonly sale = signal<SaleView | null>(null);
  protected readonly missing = signal(false);

  private saleId = '';

  ngOnInit(): void {
    this.title.setTitle('Cobro · MiPlante');
    this.saleId = this.route.snapshot.queryParamMap.get('sale') || '';
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
}
