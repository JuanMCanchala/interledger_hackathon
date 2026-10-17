import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ApiService } from '../../../core/api.service';
import { MerchantDashboard, PayoutView } from '../../../core/miplante.models';
import { BannerMessage, TabName } from '../merchant.types';

@Component({
  selector: 'app-merchant-avisos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './merchant-avisos.html',
})
export class MerchantAvisos {
  private readonly api = inject(ApiService);

  readonly merchant = input.required<MerchantDashboard>();
  readonly merchantPath = input.required<string>();

  readonly refresh = output<void>();
  readonly navigateTab = output<TabName>();

  protected readonly noticeMessage = signal<BannerMessage | null>(null);
  protected readonly noticeBusy = signal(false);
  protected readonly confirmingNotice = signal<
    Record<string, 'mark-paid' | 'use-emergency' | null>
  >({});

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

  protected formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-CO', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
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
        `${this.merchantPath()}/payouts/${encodeURIComponent(payoutId)}/${action}`,
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
      this.refresh.emit();
    } catch (err: unknown) {
      this.noticeMessage.set({
        text: (err as Error)?.message || 'Error al procesar el pago.',
        tone: 'bad',
      });
    } finally {
      this.noticeBusy.set(false);
    }
  }
}
