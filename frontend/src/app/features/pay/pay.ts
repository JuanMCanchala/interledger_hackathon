import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { SaleView } from '../../core/miplante.models';
import {
  CUSTOMER_STATUS,
  PAYMENT_STEPS,
  STORAGE_KEYS,
  badgeClass,
  formatAmount,
  normalizeWallet,
  poll,
  remember,
  statusInfo,
  walletName,
} from '../../core/miplante.utils';
import { Doodle } from '../../shared/brand/doodle';
import { SiteFooter, SiteHeader } from '../../shared/ui/site-layout';
import { SplitList } from '../../shared/ui/split-list';
import { StepsIndicator } from '../../shared/ui/steps-indicator';

const POLL_MS = 1500;
const MAX_POLLS = 400;

@Component({
  selector: 'app-pay',
  imports: [FormsModule, RouterLink, SiteHeader, SiteFooter, SplitList, StepsIndicator, Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page' },
  template: `
    <div class="container">
      <app-site-header badge="Pago seguro Open Payments" />

      <main class="narrow stack">
        @if (missing()) {
          <section class="card stack">
            <div class="row between">
              <div class="stack-sm">
                <p class="eyebrow">Enlace no encontrado</p>
                <h1 class="h1-sm">No encontramos este cobro</h1>
                <p class="muted">
                  Revisa el enlace o pide al negocio que te muestre el código QR
                  de nuevo.
                </p>
              </div>
              <span class="doodle-badge doodle-badge-lg" aria-hidden="true">
                <app-doodle name="duda" />
              </span>
            </div>
            <div class="row">
              <a class="btn btn-lima" routerLink="/">Ir al inicio</a>
              <a class="btn btn-secondary" routerLink="/merchant">Abrir mi caja</a>
            </div>
          </section>
        }

        @if (loadError()) {
          <p class="banner banner-bad" role="alert">{{ loadError() }}</p>
        }

        @if (sale(); as s) {
          <section class="card stack" aria-live="polite">
            <div class="row between">
              <div class="stack-sm">
                <p class="eyebrow">Vas a pagar a</p>
                <h1 class="h1-sm">{{ s.merchantName || 'Comercio MiPlante' }}</h1>
              </div>
              <span class="doodle-badge doodle-badge-lg" aria-hidden="true">
                <app-doodle name="pago" />
              </span>
            </div>

            <div class="cobro-amount stack-sm">
              <p class="amount-xl">{{ formatAmount(s.amount) }}</p>
              @if (s.description) {
                <p class="muted">{{ s.description }}</p>
              }
              <div>
                <span [class]="statusBadgeClass(s.status)">
                  {{ statusText(s.status) }}
                </span>
              </div>
            </div>

            @if (s.payment?.steps) {
              <app-steps-indicator
                [labels]="stepLabels"
                [doneFlags]="stepFlags(s)"
                [active]="s.status !== 'failed' && s.status !== 'paid'"
                ariaLabel="Pasos del pago"
              />
            }

            @if (displayError()) {
              <p class="banner banner-bad" role="alert">{{ displayError() }}</p>
            }

            @if (s.status === 'open' || s.status === 'failed') {
              <form class="stack" (ngSubmit)="submitPay()">
                <label class="field">
                  <span>¿Cuál es tu billetera Open Payments?</span>
                  <input
                    #walletInput
                    name="customerWallet"
                    [(ngModel)]="customerWallet"
                    required
                    maxlength="300"
                    autocomplete="off"
                    spellcheck="false"
                    autocapitalize="off"
                    placeholder="Ej: cliente-feliz"
                  />
                  <small class="hint">
                    Escribe solo el nombre de tu billetera o su dirección
                    completa (ej. <code>$ilp.interledger-test.dev/cliente</code>).
                  </small>
                </label>
                <p class="banner banner-info">
                  Te llevamos a tu billetera para que apruebes este pago. Entra
                  con tu cuenta y toca <strong>Aceptar</strong>. Nada se cobra
                  sin tu permiso.
                </p>
                <button
                  class="btn btn-lima btn-lg btn-block"
                  type="submit"
                  [disabled]="busy()"
                  [attr.aria-busy]="busy() ? 'true' : null"
                >
                  {{ busy() ? 'Abriendo tu billetera…' : 'Pagar ' + formatAmount(s.amount) + ' →' }}
                </button>
              </form>
            }

            @if (s.status === 'paid') {
              <div class="success">
                <span class="success-icon" aria-hidden="true">✓</span>
                <p class="success-title">¡Pago completado con éxito!</p>
                <p class="small">Gracias por apoyar este negocio con MiPlante.</p>
              </div>

              <section class="stack-sm">
                <h2>Así se repartió tu pago automáticamente</h2>
                <app-split-list
                  [settlement]="s.settlement"
                  [keptLabel]="(s.merchantName || 'El negocio') + ' recibe'"
                />
                @if (splitNote(s)) {
                  <p class="hint">{{ splitNote(s) }}</p>
                }
              </section>
            }
          </section>
        }
      </main>

      <app-site-footer />
    </div>
  `,
})
export default class PayPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  private readonly walletInput = viewChild<ElementRef<HTMLInputElement>>('walletInput');

  protected readonly formatAmount = formatAmount;
  protected readonly stepLabels = PAYMENT_STEPS.map(([, label]) => label);

  protected readonly sale = signal<SaleView | null>(null);
  protected readonly missing = signal(false);
  protected readonly loadError = signal('');
  protected readonly submitError = signal('');
  protected readonly busy = signal(false);
  protected customerWallet = walletName(remember.get(STORAGE_KEYS.customerWallet));

  private saleId = '';
  private stopPoll: (() => void) | null = null;

  protected readonly displayError = computed(() => {
    if (this.submitError()) return this.submitError();
    const s = this.sale();
    if (s?.status === 'failed') {
      return `El pago no se completó${s.error ? `: ${s.error}` : ''}. Puedes intentarlo de nuevo.`;
    }
    return '';
  });

  ngOnInit(): void {
    this.title.setTitle('Pagar · MiPlante');
    this.saleId = this.route.snapshot.queryParamMap.get('sale') || '';
    if (!this.saleId) {
      this.missing.set(true);
    } else {
      this.load();
    }
  }

  protected statusText(status: string): string {
    return statusInfo(CUSTOMER_STATUS, status).text;
  }

  protected statusBadgeClass(status: string): string {
    return badgeClass(statusInfo(CUSTOMER_STATUS, status).tone);
  }

  protected stepFlags(s: SaleView): boolean[] {
    const steps = (s.payment?.steps ?? {}) as Record<string, boolean | undefined>;
    return PAYMENT_STEPS.map(([key]) => Boolean(steps[key]));
  }

  protected splitNote(s: SaleView): string {
    const status = s.settlement?.status;
    if (status === 'pending' || status === 'running') return 'Repartiendo el pago…';
    if (status === 'skipped') return s.settlement?.reason || 'Este pago no se repartió.';
    return '';
  }

  private isFinal(s: SaleView): boolean {
    if (s.status === 'failed') return true;
    return (
      s.status === 'paid' &&
      ['done', 'skipped'].includes(s.settlement?.status || '') &&
      !(s.settlement?.items || []).some((item) => item.status === 'processing')
    );
  }

  private applySale(s: SaleView): void {
    this.sale.set(s);
    if (s.merchantName) {
      this.title.setTitle(`Pagar a ${s.merchantName} · MiPlante`);
    }
  }

  private async fetchSale(): Promise<SaleView> {
    return this.api.get<SaleView>(`/api/sales/${encodeURIComponent(this.saleId)}`);
  }

  private startPolling(): void {
    this.stopPoll?.();
    let attempts = 0;
    this.stopPoll = poll(
      async () => {
        attempts += 1;
        const s = await this.fetchSale();
        this.applySale(s);
        return !this.isFinal(s) && attempts < MAX_POLLS;
      },
      POLL_MS,
      this.destroyRef,
    );
  }

  private async load(): Promise<void> {
    try {
      const s = await this.fetchSale();
      this.applySale(s);
      if (s.status !== 'open' && !this.isFinal(s)) {
        this.startPolling();
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr?.status === 404) {
        this.missing.set(true);
        return;
      }
      this.loadError.set(
        `No pudimos cargar el cobro: ${apiErr?.message || 'Error'}. Recarga la página.`,
      );
    }
  }

  protected async submitPay(): Promise<void> {
    if (this.busy()) return;
    this.submitError.set('');
    const wallet = normalizeWallet(this.customerWallet);
    if (!wallet) {
      this.walletInput()?.nativeElement.focus();
      return;
    }

    this.busy.set(true);
    try {
      const { redirectUrl } = await this.api.post<{ redirectUrl: string }>(
        `/api/sales/${encodeURIComponent(this.saleId)}/pay`,
        { customerWallet: wallet },
      );
      remember.set(STORAGE_KEYS.customerWallet, wallet);
      window.location.href = redirectUrl;
    } catch (err: unknown) {
      this.submitError.set((err as Error)?.message || 'No pudimos iniciar el pago.');
    } finally {
      this.busy.set(false);
    }
  }
}
