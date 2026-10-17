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
import { MerchantDashboard, UserView } from '../../../core/miplante.models';
import {
  formatAmount,
  formatMoney,
  formatThousandsInput,
  groupThousands,
  normalizeDecimal,
  toDecimal,
  toNumber,
  walletName,
} from '../../../core/miplante.utils';
import { VoiceService } from '../../../core/voice.service';
import { QrCode } from '../../../shared/ui/qr-code';
import { BannerMessage } from '../merchant.types';

@Component({
  selector: 'app-merchant-ajustes',
  imports: [FormsModule, QrCode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './merchant-ajustes.html',
})
export class MerchantAjustes {
  private readonly api = inject(ApiService);
  protected readonly voice = inject(VoiceService);

  readonly merchant = input.required<MerchantDashboard>();
  readonly merchantPath = input.required<string>();
  readonly account = input<UserView | null>(null);

  readonly refresh = output<void>();
  readonly logout = output<void>();

  protected readonly formatAmount = formatAmount;
  protected readonly walletName = walletName;

  protected shopNameInput = '';
  protected capNewInput = '';
  protected emergencyPickId = '';
  private settingsFilled = false;

  protected readonly settingsBusy = signal(false);
  protected readonly shopMessage = signal<BannerMessage | null>(null);
  protected readonly capMessage = signal<BannerMessage | null>(null);
  protected readonly emergencyMessage = signal<BannerMessage | null>(null);
  protected readonly showDisplayQr = signal(false);
  protected readonly displayBusy = signal(false);
  protected readonly displayMessage = signal<BannerMessage | null>(null);

  protected readonly totalQuotasAmount = computed(() => {
    const m = this.merchant();
    return m.rules
      .filter((r) => r.kind === 'debt')
      .reduce((sum, r) => sum + toNumber(r.monthlyQuota), 0);
  });

  protected readonly savingsRules = computed(() =>
    this.merchant().rules.filter((r) => r.kind === 'savings'),
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
    const cur = m.emergency;
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

  constructor() {
    effect(() => {
      const m = this.merchant();
      untracked(() => {
        if (!this.settingsFilled) {
          this.settingsFilled = true;
          this.shopNameInput = m.name;
          this.capNewInput = groupThousands(toDecimal(m.monthlyCap));
          const firstSavings = m.rules.find((r) => r.kind === 'savings');
          if (firstSavings && !this.emergencyPickId) {
            this.emergencyPickId = firstSavings.id;
          }
        }
      });
    });
  }

  protected money(value: number): string {
    const asset = this.merchant().asset ?? { assetCode: 'COP', assetScale: 2 };
    return formatMoney(value, asset.assetCode, asset.assetScale);
  }

  protected onCapNewInput(raw: string): void {
    this.capNewInput = formatThousandsInput(raw);
  }

  protected async saveShopName(): Promise<void> {
    const name = this.shopNameInput.trim();
    if (!name) {
      this.shopMessage.set({ text: 'Escribe el nombre de tu negocio.', tone: 'bad' });
      return;
    }
    if (this.settingsBusy()) return;
    this.shopMessage.set(null);
    this.settingsBusy.set(true);
    try {
      await this.api.put(`${this.merchantPath()}/settings`, { name });
      this.settingsFilled = false;
      this.refresh.emit();
      this.shopMessage.set({ text: 'Nombre guardado.', tone: 'ok' });
    } catch (err: unknown) {
      this.shopMessage.set({
        text: (err as Error)?.message || 'Error al guardar.',
        tone: 'bad',
      });
    } finally {
      this.settingsBusy.set(false);
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
        `${this.merchantPath()}/cap`,
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
      this.merchant().emergency?.status !== 'active';
    const ruleId = showPicker ? this.emergencyPickId : undefined;
    this.settingsBusy.set(true);
    try {
      const { redirectUrl } = await this.api.post<{ redirectUrl: string }>(
        `${this.merchantPath()}/emergency`,
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

  protected async linkDisplay(rotate = false): Promise<void> {
    if (this.displayBusy()) return;
    this.displayBusy.set(true);
    this.displayMessage.set(null);
    try {
      await this.api.post(`${this.merchantPath()}/display`, {});
      this.refresh.emit();
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

  protected toggleAnnouncements(): void {
    this.voice.setAnnouncements(!this.voice.announcements());
  }

  protected tryVoice(): void {
    this.voice.chime();
    void this.voice.speak('¡Hola! Soy GlorIA. ¡Pago recibido! Veinte mil pesos. Así te aviso cada venta.');
  }
}
