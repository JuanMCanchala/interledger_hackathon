import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Amount, SandboxMandate, SandboxPayment } from '../../core/miplante.models';
import { PAYMENT_STEPS, remember } from '../../core/miplante.utils';

interface ResultView {
  title: string;
  status: string;
  steps?: Record<string, boolean>;
  details: [string, string][];
  error?: string;
}

@Component({
  selector: 'app-sandbox',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      --bg: #f5f6f8;
      --card: #ffffff;
      --text: #15171c;
      --muted: #5d6474;
      --border: #dde1e8;
      --accent: #0f766e;
      --accent-text: #ffffff;
      --ok: #15803d;
      --err: #b91c1c;
      --pending: #a16207;
      display: block;
      min-height: 100dvh;
      background: var(--bg);
      color: var(--text);
      font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #0f1115;
        --card: #171a21;
        --text: #e7e9ee;
        --muted: #9aa1b1;
        --border: #2a2f3a;
        --accent: #2dd4bf;
        --accent-text: #06201d;
        --ok: #4ade80;
        --err: #f87171;
        --pending: #facc15;
      }
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 24px 16px 64px;
    }
    h1 {
      font-size: 1.5rem;
      margin: 0 0 4px;
      line-height: 1.3;
    }
    h2 {
      font-size: 1.1rem;
      margin: 0 0 12px;
      line-height: 1.3;
    }
    p {
      margin: 0 0 12px;
    }
    .muted {
      color: var(--muted);
    }
    .sb-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
      color: var(--text);
    }
    form {
      display: grid;
      gap: 10px;
    }
    .sb-row {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 560px) {
      .sb-row {
        grid-template-columns: 1fr;
      }
    }
    label {
      display: grid;
      gap: 4px;
      font-size: 0.85rem;
      color: var(--muted);
    }
    input,
    select {
      width: 100%;
      padding: 9px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--text);
      font: inherit;
    }
    button {
      justify-self: start;
      padding: 9px 16px;
      border: 0;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-text);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      color: var(--err);
      border: 1px solid var(--border);
    }
    button:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .sb-steps {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin: 12px 0;
    }
    @media (max-width: 560px) {
      .sb-steps {
        grid-template-columns: 1fr 1fr;
      }
    }
    .sb-step {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .sb-step.done {
      border-color: var(--ok);
      color: var(--ok);
      font-weight: 600;
    }
    .status {
      font-weight: 700;
    }
    .status.completed,
    .status.active {
      color: var(--ok);
    }
    .status.failed,
    .status.rejected,
    .status.revoked {
      color: var(--err);
    }
    .status.processing,
    .status.awaiting-consent {
      color: var(--pending);
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 12px;
      margin: 0;
      font-size: 0.9rem;
    }
    dt {
      color: var(--muted);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .error {
      color: var(--err);
      font-weight: 600;
      margin-top: 8px;
    }
    .back-link {
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
    }
  `,
  template: `
    <main>
      <p><a routerLink="/" class="back-link">← MiPlante</a></p>
      <h1>Open Payments sandbox</h1>
      <p class="muted">
        Prueba el flujo obligatorio contra el test wallet: solicitud de pago →
        autorización → ejecución → finalización. Las wallet addresses pueden ir
        como <code>$ilp.interledger-test.dev/nombre</code>.
      </p>

      @if (result(); as res) {
        <section class="sb-card">
          <h2>{{ res.title }}</h2>
          <p>
            Estado:
            <span [class]="'status ' + res.status">{{ res.status }}</span>
          </p>
          @if (res.steps) {
            <div class="sb-steps">
              @for (step of stepDefinitions; track step[0]) {
                <div class="sb-step" [class.done]="res.steps[step[0]]">
                  {{ res.steps[step[0]] ? '✓' : '○' }} {{ step[1] }}
                </div>
              }
            </div>
          }
          <dl>
            @for (row of res.details; track row[0]) {
              <dt>{{ row[0] }}</dt>
              <dd>{{ row[1] }}</dd>
            }
          </dl>
          @if (res.error) {
            <p class="error">{{ res.error }}</p>
          }
        </section>
      }

      <section class="sb-card">
        <h2>1. Pago único</h2>
        <p class="muted">
          Quien recibe recibe exactamente el monto, en su moneda; quien paga
          aprueba en su wallet.
        </p>
        <form (ngSubmit)="submitPayment()">
          <div class="sb-row">
            <label>
              Wallet que paga
              <input name="sender" [(ngModel)]="paymentSender" required />
            </label>
            <label>
              Wallet que recibe
              <input name="receiver" [(ngModel)]="paymentReceiver" required />
            </label>
          </div>
          <div class="sb-row">
            <label>
              Monto (moneda de quien recibe)
              <input
                name="amount"
                [(ngModel)]="paymentAmount"
                required
                inputmode="decimal"
                placeholder="10.00"
              />
            </label>
            <label>
              Descripción
              <input
                name="description"
                [(ngModel)]="paymentDescription"
                maxlength="200"
              />
            </label>
          </div>
          <button type="submit" [disabled]="busyPayment()">
            Pagar con Open Payments
          </button>
        </form>
      </section>

      <section class="sb-card">
        <h2>2. Autorización recurrente</h2>
        <p class="muted">
          Quien paga aprueba una sola vez un tope de débito (por periodo, si
          eliges uno); luego la app cobra sin volver a pedir permiso.
        </p>
        <form (ngSubmit)="submitMandate()">
          <div class="sb-row">
            <label>
              Wallet que paga
              <input name="mandateSender" [(ngModel)]="mandateSender" required />
            </label>
            <label>
              Tope (moneda de quien paga)
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
            <label>
              Periodo
              <select name="interval" [(ngModel)]="mandateInterval">
                <option value="">Sin periodo (tope total)</option>
                <option value="PT1M">Cada minuto (demo)</option>
                <option value="P1D">Diario</option>
                <option value="P1W">Semanal</option>
                <option value="P15D">Quincenal</option>
                <option value="P1M">Mensual</option>
              </select>
            </label>
            <label>
              Descripción
              <input
                name="mandateDescription"
                [(ngModel)]="mandateDescription"
                maxlength="200"
              />
            </label>
          </div>
          <button type="submit" [disabled]="busyMandate()">
            Pedir autorización
          </button>
        </form>
      </section>

      @if (canCharge()) {
        <section class="sb-card">
          <h2>3. Cobrar con la autorización</h2>
          <form (ngSubmit)="submitCharge()">
            <div class="sb-row">
              <label>
                Wallet que recibe
                <input name="chargeReceiver" [(ngModel)]="chargeReceiver" required />
              </label>
              <label>
                Monto
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
              <label>
                El monto es
                <select name="amountType" [(ngModel)]="chargeAmountType">
                  <option value="receive">Lo que recibe el destinatario</option>
                  <option value="send">Lo que paga el remitente</option>
                </select>
              </label>
              <label>
                Descripción
                <input
                  name="chargeDescription"
                  [(ngModel)]="chargeDescription"
                  maxlength="200"
                />
              </label>
            </div>
            <button type="submit" [disabled]="busyCharge()">Cobrar</button>
          </form>
          <p></p>
          <button type="button" class="secondary" (click)="revokeMandate()">
            Revocar autorización
          </button>
        </section>
      }
    </main>
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
    this.title.setTitle('Open Payments Sandbox');
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
