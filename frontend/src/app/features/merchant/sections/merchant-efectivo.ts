import {
  ChangeDetectionStrategy,
  Component,
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
import { Amount, MerchantDashboard } from '../../../core/miplante.models';
import {
  formatAmount,
  formatMoney,
  formatTime,
  groupThousands,
  normalizeDecimal,
  toDecimal,
  toNumber,
} from '../../../core/miplante.utils';
import { BannerMessage } from '../merchant.types';

@Component({
  selector: 'app-merchant-efectivo',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './merchant-efectivo.html',
})
export class MerchantEfectivo {
  private readonly api = inject(ApiService);

  readonly merchant = input.required<MerchantDashboard>();
  readonly merchantPath = input.required<string>();
  readonly externalMessage = input<BannerMessage | null>(null);

  readonly refresh = output<void>();
  readonly registerCashSale = output<void>();

  protected readonly formatAmount = formatAmount;
  protected readonly formatTime = formatTime;
  protected readonly toNumber = toNumber;
  protected readonly groupThousandsOf = (amount?: Amount | null) =>
    amount ? groupThousands(toDecimal(amount)) : '';

  protected depositInput = '';
  protected readonly cashBusy = signal(false);
  protected readonly cashMessage = signal<BannerMessage | null>(null);

  protected readonly cashSales = computed(() =>
    (this.merchant().sales ?? []).filter((s) => s.method === 'cash'),
  );

  constructor() {
    effect(() => {
      const m = this.merchant();
      untracked(() => {
        if (!this.depositInput && m.cash?.toDeposit && toNumber(m.cash.toDeposit) > 0) {
          this.depositInput = groupThousands(toDecimal(m.cash.toDeposit));
        } else if (m.cash && toNumber(m.cash.toDeposit) <= 0) {
          this.depositInput = '';
        }
      });
    });

    effect(() => {
      const msg = this.externalMessage();
      if (msg) {
        untracked(() => this.cashMessage.set(msg));
      }
    });
  }

  protected async depositCash(): Promise<void> {
    if (this.cashBusy()) return;
    const amount = normalizeDecimal(this.depositInput);
    if (!amount || Number(amount) <= 0) {
      this.cashMessage.set({ tone: 'bad', text: 'Escribe cuánto consignaste.' });
      return;
    }
    this.cashBusy.set(true);
    try {
      const num = Number(amount);
      const r = await this.api.post<{
        sent: Amount;
        reserved: Amount;
        stillInCash: Amount;
        credit: Amount;
        paidNow: string[];
        failed: string[];
      }>(`${this.merchantPath()}/cash-deposits`, { amount: String(num) });
      this.depositInput =
        toNumber(r.stillInCash) > 0 ? groupThousands(toDecimal(r.stillInCash)) : '';
      const parts = [
        `Consignación de ${formatMoney(num, 'COP')} registrada.`,
        toNumber(r.sent) > 0 ? `Enviado a tus ahorros: ${formatAmount(r.sent)}.` : '',
        toNumber(r.reserved) > 0 ? `Apartado para tus proveedores: ${formatAmount(r.reserved)}.` : '',
        r.paidNow.length ? `Pagado ya a ${r.paidNow.join(', ')}.` : '',
        r.failed.length ? `No se pudo enviar a ${r.failed.join(', ')}.` : '',
        toNumber(r.stillInCash) > 0
          ? `Falta por consignar: ${formatAmount(r.stillInCash)}.`
          : 'No queda nada por consignar.',
      ];
      this.cashMessage.set({
        tone: r.failed.length === 0 ? 'ok' : 'bad',
        text: parts.filter(Boolean).join(' '),
      });
      this.refresh.emit();
    } catch (err: unknown) {
      this.cashMessage.set({
        tone: 'bad',
        text: (err as Error)?.message || 'No pudimos registrar la consignación.',
      });
    } finally {
      this.cashBusy.set(false);
    }
  }
}
