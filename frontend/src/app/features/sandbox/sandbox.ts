import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Amount, SandboxMandate, SandboxPayment } from '../../core/miplante.models';
import { PAYMENT_STEPS, remember } from '../../core/miplante.utils';
import { Doodle } from '../../shared/brand/doodle';
import { SiteFooter, SiteHeader } from '../../shared/ui/site-layout';

interface ResultView {
  title: string;
  status: string;
  steps?: Record<string, boolean>;
  details: [string, string][];
  error?: string;
}

@Component({
  selector: 'app-sandbox',
  imports: [FormsModule, SiteHeader, SiteFooter, Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page' },
  styles: `
    .sb-grid {
      display: grid;
      gap: 20px;
      grid-template-columns: minmax(0, 1fr);
    }
    @media (min-width: 880px) {
      .sb-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .sb-row {
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr);
    }
    @media (min-width: 560px) {
      .sb-row {
        grid-template-columns: 1fr 1fr;
      }
    }
    .sb-dl {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 6px 14px;
      margin: 0;
      padding: 14px;
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      border: 1px solid var(--border);
      font-size: 0.88rem;
    }
    .sb-dl dt {
      color: var(--muted);
      font-weight: 700;
    }
    .sb-dl dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    }
  `,
  template: `
    <div class="container">
      <app-site-header
        badge="Laboratorio Open Payments"
        actionLabel="Ir a mi caja"
        actionLink="/merchant"
      />

      <main class="stack">
        <div class="stack-sm">
          <p class="eyebrow">Red Interledger · Test Wallet</p>
          <h1>Open Payments Sandbox</h1>
          <p class="lead">
            Prueba el flujo completo contra el test wallet:
            <span class="marker-lima">solicitud → autorización → ejecución → finalización</span>.
            Puedes escribir las wallet addresses como
            <code>$ilp.interledger-test.dev/nombre</code> o solo el nombre.
          </p>
        </div>

        @if (result(); as res) {
          <section class="card card-forest stack" aria-live="polite">
            <div class="row between">
              <div>
                <p class="eyebrow">Resultado de la operación</p>
                <h2>{{ res.title }}</h2>
              </div>
              <span
                class="badge"
                [class.badge-ok]="res.status === 'completed' || res.status === 'active'"
                [class.badge-bad]="res.status === 'failed' || res.status === 'rejected' || res.status === 'revoked'"
                [class.badge-wait]="res.status === 'processing' || res.status === 'awaiting-consent'"
              >
                {{ res.status }}
              </span>
            </div>

            @if (res.steps) {
              <ol class="steps">
                @for (step of stepDefinitions; track step[0]) {
                  <li class="step" [class.is-done]="res.steps[step[0]]">
                    <span class="step-icon" aria-hidden="true">
                      {{ res.steps[step[0]] ? '✓' : '○' }}
                    </span>
                    <span>{{ step[1] }}</span>
                  </li>
                }
              </ol>
            }

            @if (res.details.length) {
              <dl class="sb-dl">
                @for (row of res.details; track row[0]) {
                  <dt>{{ row[0] }}</dt>
                  <dd>{{ row[1] }}</dd>
                }
              </dl>
            }

            @if (res.error) {
              <p class="banner banner-bad" role="alert">{{ res.error }}</p>
            }
          </section>
        }

        <div class="sb-grid">
          <section class="card stack">
            <div class="row between">
              <div class="stack-sm">
                <p class="eyebrow">Flujo 1 · Pago directo</p>
                <h2>1. Pago único</h2>
                <p class="muted small">
                  Quien recibe obtiene exactamente el monto en su moneda; quien
                  paga aprueba una sola vez en su billetera.
                </p>
              </div>
              <span class="doodle-badge" aria-hidden="true">
                <app-doodle name="pago" />
              </span>
            </div>

            <form class="stack" (ngSubmit)="submitPayment()">
              <div class="sb-row">
                <label class="field">
                  <span>Wallet que paga</span>
                  <input
                    name="sender"
                    [(ngModel)]="paymentSender"
                    required
                    placeholder="$ilp.interledger-test.dev/cliente"
                  />
                </label>
                <label class="field">
                  <span>Wallet que recibe</span>
                  <input
                    name="receiver"
                    [(ngModel)]="paymentReceiver"
                    required
                    placeholder="$ilp.interledger-test.dev/tienda"
                  />
                </label>
              </div>
              <div class="sb-row">
                <label class="field">
                  <span>Monto (moneda de quien recibe)</span>
                  <input
                    name="amount"
                    [(ngModel)]="paymentAmount"
                    required
                    inputmode="decimal"
                    placeholder="10.00"
                  />
                </label>
                <label class="field">
                  <span>Descripción</span>
                  <input
                    name="description"
                    [(ngModel)]="paymentDescription"
                    maxlength="200"
                    placeholder="Compra en tienda"
                  />
                </label>
              </div>
              <button
                type="submit"
                class="btn btn-lima btn-block"
                [disabled]="busyPayment()"
              >
                {{ busyPayment() ? 'Abriendo wallet…' : 'Pagar con Open Payments →' }}
              </button>
            </form>
          </section>

          <section class="card stack">
            <div class="row between">
              <div class="stack-sm">
                <p class="eyebrow">Flujo 2 · Grant con intervalo</p>
                <h2>2. Autorización recurrente</h2>
                <p class="muted small">
                  Quien paga aprueba una sola vez un tope de débito por periodo;
                  luego la app ejecuta repartos sin volver a pedir permiso.
                </p>
              </div>
              <span class="doodle-badge" aria-hidden="true">
                <app-doodle name="billetera" />
              </span>
            </div>

            <form class="stack" (ngSubmit)="submitMandate()">
              <div class="sb-row">
                <label class="field">
                  <span>Wallet que autoriza</span>
                  <input
                    name="mandateSender"
                    [(ngModel)]="mandateSender"
                    required
                    placeholder="$ilp.interledger-test.dev/tienda"
                  />
                </label>
                <label class="field">
                  <span>Tope (moneda de quien paga)</span>
                  <input
                    name="maxAmount"
                    [(ngModel)]="mandateMaxAmount"
                    required
                    inputmode="decimal"
                    placeholder="20.00"
                  />
                </label>
              </div>
              <div class="sb-row">
                <label class="field">
                  <span>Periodo</span>
                  <select name="interval" [(ngModel)]="mandateInterval">
                    <option value="">Sin periodo (tope total)</option>
                    <option value="PT1M">Cada minuto (demo)</option>
                    <option value="P1D">Diario</option>
                    <option value="P1W">Semanal</option>
                    <option value="P15D">Quincenal</option>
                    <option value="P1M">Mensual</option>
                  </select>
                </label>
                <label class="field">
                  <span>Descripción</span>
                  <input
                    name="mandateDescription"
                    [(ngModel)]="mandateDescription"
                    maxlength="200"
                    placeholder="Límite mensual MiPlante"
                  />
                </label>
              </div>
              <button
                type="submit"
                class="btn btn-lima btn-block"
                [disabled]="busyMandate()"
              >
                {{ busyMandate() ? 'Solicitando permiso…' : 'Pedir autorización →' }}
              </button>
            </form>
          </section>
        </div>

        @if (canCharge()) {
          <section class="card stack">
            <div class="row between">
              <div class="stack-sm">
                <p class="eyebrow">Flujo 3 · Uso del token autorizado</p>
                <h2>3. Cobrar con la autorización activa</h2>
              </div>
              <span class="doodle-badge" aria-hidden="true">
                <app-doodle name="monedas" />
              </span>
            </div>

            <form class="stack" (ngSubmit)="submitCharge()">
              <div class="sb-row">
                <label class="field">
                  <span>Wallet que recibe</span>
                  <input name="chargeReceiver" [(ngModel)]="chargeReceiver" required />
                </label>
                <label class="field">
                  <span>Monto</span>
                  <input
                    name="chargeAmount"
                    [(ngModel)]="chargeAmount"
                    required
                    inputmode="decimal"
                    placeholder="5.00"
                  />
                </label>
              </div>
              <div class="sb-row">
                <label class="field">
                  <span>El monto corresponde a</span>
                  <select name="amountType" [(ngModel)]="chargeAmountType">
                    <option value="receive">Lo que recibe el destinatario</option>
                    <option value="send">Lo que paga el remitente</option>
                  </select>
                </label>
                <label class="field">
                  <span>Descripción</span>
                  <input
                    name="chargeDescription"
                    [(ngModel)]="chargeDescription"
                    maxlength="200"
                  />
                </label>
              </div>
              <div class="row">
                <button type="submit" class="btn btn-lima" [disabled]="busyCharge()">
                  {{ busyCharge() ? 'Ejecutando cobro…' : 'Ejecutar cobro →' }}
                </button>
                <button type="button" class="btn btn-danger" (click)="revokeMandate()">
                  Revocar autorización
                </button>
              </div>
            </form>
          </section>
        }
      </main>

      <app-site-footer />
    </div>
  `,
})
export default class SandboxPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);

  protected readonly stepDefinitions = PAYMENT_STEPS;

  protected readonly result = signal<ResultView | null>(null);
  protected readonly canCharge = signal(false);

  protected readonly busyPayment = signal(false);
  protected readonly busyMandate = signal(false);
  protected readonly busyCharge = signal(false);

  protected paymentSender = remember.get('sender');
  protected paymentReceiver = remember.get('receiver');
  protected paymentAmount = '';
  protected paymentDescription = '';

  protected mandateSender = remember.get('sender');
  protected mandateMaxAmount = '';
  protected mandateInterval = 'P1W';
  protected mandateDescription = '';

  protected chargeReceiver = remember.get('receiver');
  protected chargeAmount = '';
  protected chargeAmountType = 'receive';
  protected chargeDescription = '';

  private currentMandateId: string | null = null;

  ngOnInit(): void {
    this.title.setTitle('Open Payments Sandbox · MiPlante');
    const params = this.route.snapshot.queryParamMap;
    const paymentId = params.get('payment');
    this.currentMandateId = params.get('mandate');

    if (paymentId) {
      this.pollPayment(paymentId).catch((err) => this.showError(err));
    }
    if (this.currentMandateId) {
      this.loadMandate(this.currentMandateId).catch((err) => this.showError(err));
    }
  }

  private async sandboxApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const details = body.details ? [].concat(body.details).join('; ') : '';
      throw new Error(
        [body.error || `HTTP ${res.status}`, details].filter(Boolean).join(': '),
      );
    }
    return body as T;
  }

  private formatSbAmount(amount?: Amount): string {
    if (!amount) return '—';
    const value = Number(amount.value) / 10 ** amount.assetScale;
    return `${value.toLocaleString('es-CO', { maximumFractionDigits: amount.assetScale })} ${amount.assetCode}`;
  }

  private showResult(
    title: string,
    record: { status: string; steps?: Record<string, boolean>; error?: string },
    details: [string, string | undefined][],
  ): void {
    this.result.set({
      title,
      status: record.status,
      steps: record.steps,
      details: details.filter(([, val]) => val !== undefined && val !== null && val !== '') as [
        string,
        string,
      ][],
      error: record.error,
    });
  }

  private showPayment(payment: SandboxPayment): void {
    this.showResult(
      payment.kind === 'mandate-charge' ? 'Cobro con autorización' : 'Pago único',
      payment,
      [
        ['Paga', payment.sender],
        ['Recibe', payment.receiver],
        ['Débito', this.formatSbAmount(payment.debitAmount)],
        ['A recibir', this.formatSbAmount(payment.receiveAmount)],
        ['Recibido', this.formatSbAmount(payment.receivedAmount)],
        ['Descripción', payment.description],
        ['Pago entrante', payment.incomingPaymentUrl],
        ['Pago saliente', payment.outgoingPaymentUrl],
      ],
    );
  }

  private showError(error: unknown): void {
    this.showResult(
      'Error',
      { status: 'failed', error: (error as Error)?.message || 'Error' },
      [],
    );
  }

  private async pollPayment(id: string): Promise<SandboxPayment | undefined> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const payment = await this.sandboxApi<SandboxPayment>(
        `/api/payments/${encodeURIComponent(id)}`,
      );
      this.showPayment(payment);
      if (payment.status !== 'processing') return payment;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return undefined;
  }

  private async loadMandate(id: string): Promise<SandboxMandate> {
    const mandate = await this.sandboxApi<SandboxMandate>(
      `/api/mandates/${encodeURIComponent(id)}`,
    );
    const spent = mandate.spent?.debitAmount;
    this.showResult('Autorización recurrente', mandate, [
      ['ID', mandate.id],
      ['Paga', mandate.sender],
      ['Tope', this.formatSbAmount(mandate.maxAmount)],
      ['Periodo', mandate.interval],
      ['Gastado en el periodo', spent ? this.formatSbAmount(spent) : undefined],
      ['Cobros', String(mandate.payments.length)],
      ['Descripción', mandate.description],
    ]);
    this.canCharge.set(mandate.status === 'active');
    return mandate;
  }

  protected async submitPayment(): Promise<void> {
    this.busyPayment.set(true);
    try {
      remember.set('sender', this.paymentSender);
      remember.set('receiver', this.paymentReceiver);
      const body: Record<string, string> = {
        sender: this.paymentSender,
        receiver: this.paymentReceiver,
        amount: this.paymentAmount,
      };
      if (this.paymentDescription) body['description'] = this.paymentDescription;
      const { redirectUrl } = await this.sandboxApi<{ redirectUrl: string }>(
        '/api/payments',
        { method: 'POST', body: JSON.stringify(body) },
      );
      window.location.href = redirectUrl;
    } catch (err) {
      this.showError(err);
    } finally {
      this.busyPayment.set(false);
    }
  }

  protected async submitMandate(): Promise<void> {
    this.busyMandate.set(true);
    try {
      remember.set('sender', this.mandateSender);
      const body: Record<string, string> = {
        sender: this.mandateSender,
        maxAmount: this.mandateMaxAmount,
      };
      if (this.mandateInterval) body['interval'] = this.mandateInterval;
      if (this.mandateDescription) body['description'] = this.mandateDescription;
      const { redirectUrl } = await this.sandboxApi<{ redirectUrl: string }>(
        '/api/mandates',
        { method: 'POST', body: JSON.stringify(body) },
      );
      window.location.href = redirectUrl;
    } catch (err) {
      this.showError(err);
    } finally {
      this.busyMandate.set(false);
    }
  }

  protected async submitCharge(): Promise<void> {
    if (!this.currentMandateId) return;
    this.busyCharge.set(true);
    try {
      remember.set('receiver', this.chargeReceiver);
      const body: Record<string, string> = {
        receiver: this.chargeReceiver,
        amount: this.chargeAmount,
        amountType: this.chargeAmountType,
      };
      if (this.chargeDescription) body['description'] = this.chargeDescription;
      const payment = await this.sandboxApi<SandboxPayment>(
        `/api/mandates/${encodeURIComponent(this.currentMandateId)}/charges`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      this.showPayment(payment);
      await this.pollPayment(payment.id);
    } catch (err) {
      this.showError(err);
    } finally {
      this.busyCharge.set(false);
    }
  }

  protected async revokeMandate(): Promise<void> {
    if (!this.currentMandateId) return;
    try {
      await this.sandboxApi(`/api/mandates/${encodeURIComponent(this.currentMandateId)}`, {
        method: 'DELETE',
      });
      await this.loadMandate(this.currentMandateId);
    } catch (err) {
      this.showError(err);
    }
  }
}
