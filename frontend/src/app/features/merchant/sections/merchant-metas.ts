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
import { MerchantDashboard } from '../../../core/miplante.models';
import {
  formatAmount,
  formatMoney,
  formatThousandsInput,
  groupThousands,
  normalizeDecimal,
  toDecimal,
  toNumber,
} from '../../../core/miplante.utils';
import { ProgressRing } from '../../../shared/ui/progress-ring';
import { BannerMessage } from '../merchant.types';

@Component({
  selector: 'app-merchant-metas',
  imports: [FormsModule, ProgressRing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './merchant-metas.html',
})
export class MerchantMetas {
  private readonly api = inject(ApiService);

  readonly merchant = input.required<MerchantDashboard>();
  readonly merchantPath = input.required<string>();

  readonly refresh = output<void>();
  readonly editSavingsRules = output<void>();

  protected readonly currentMonthName = new Date().toLocaleDateString('es-CO', {
    month: 'long',
  });

  protected readonly editingSalesGoal = signal(false);
  protected salesGoalInput = '';
  protected readonly settingsBusy = signal(false);
  protected readonly goalMessage = signal<BannerMessage | null>(null);

  constructor() {
    effect(() => {
      const m = this.merchant();
      untracked(() => {
        if (!this.editingSalesGoal()) {
          this.salesGoalInput = groupThousands(toDecimal(m.monthlySalesGoal));
        }
      });
    });
  }

  private money(value: number): string {
    const asset = this.merchant().asset ?? { assetCode: 'COP', assetScale: 2 };
    return formatMoney(value, asset.assetCode, asset.assetScale);
  }

  private projection({
    done,
    target,
    dayOfMonth,
    daysInMonth,
    monthly,
  }: {
    done: number;
    target: number;
    dayOfMonth: number;
    daysInMonth: number;
    monthly: boolean;
  }): string {
    if (target <= 0) return '';
    if (done >= target) return '¡Meta cumplida!';
    const perDay = done / dayOfMonth;
    const left = target - done;
    if (monthly) {
      const remainingDays = daysInMonth - dayOfMonth;
      if (perDay > 0) {
        const finishDay = dayOfMonth + Math.ceil(left / perDay);
        if (finishDay <= daysInMonth) {
          return `A este ritmo la completas el ${finishDay} de ${this.currentMonthName}.`;
        }
      }
      return remainingDays > 0
        ? `Para lograrla este mes necesitas ${this.money(left / remainingDays)} por día.`
        : `Faltan ${this.money(left)} y hoy termina el mes.`;
    }
    if (perDay <= 0) return 'Aún no hay ahorro este mes para proyectar la fecha.';
    const date = new Date(Date.now() + Math.ceil(left / perDay) * 86_400_000);
    return `A este ritmo la alcanzas hacia el ${date.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}.`;
  }

  protected readonly salesGoalCard = computed(() => {
    const m = this.merchant();
    const { dayOfMonth, daysInMonth } = m.month;
    const salesGoal = toNumber(m.monthlySalesGoal);
    const sold = toNumber(m.month.gross);
    if (salesGoal > 0) {
      const ratio = sold / salesGoal;
      const dailyTarget = salesGoal / daysInMonth;
      return {
        hasGoal: true,
        ratio,
        ringLabel: `Meta de ventas: ${Math.round(ratio * 100)}%`,
        soldFormatted: formatAmount(m.month.gross),
        goalFormatted: formatAmount(m.monthlySalesGoal),
        dailyPaceFormatted: this.money(dailyTarget),
        note: this.projection({
          done: sold,
          target: salesGoal,
          dayOfMonth,
          daysInMonth,
          monthly: true,
        }),
      };
    }
    return {
      hasGoal: false,
      ratio: 0,
      ringLabel: 'Meta de ventas: 0%',
      soldFormatted: formatAmount(m.month.gross),
      goalFormatted: '',
      dailyPaceFormatted: '',
      note: 'Fija cuánto te propones vender este mes para medir tu ritmo diario y proyectar cuándo lo logras.',
    };
  });

  protected readonly savingsGoalCards = computed(() => {
    const m = this.merchant();
    const { dayOfMonth, daysInMonth } = m.month;
    return m.rules
      .filter((r) => r.kind === 'savings')
      .map((rule) => {
        const saved = toNumber(rule.repaid);
        const goal = toNumber(rule.savingsGoal);
        const thisMonth = toNumber(rule.paidThisMonth);
        const sharePct = (rule.shareBps / 100).toLocaleString('es-CO', {
          maximumFractionDigits: 2,
        });
        if (goal > 0) {
          const ratio = saved / goal;
          return {
            id: rule.id,
            eyebrow: `${rule.category || 'Ahorro'} · ${sharePct}% por venta`,
            title: rule.label,
            hasGoal: true,
            ratio,
            tone: 'info' as const,
            ringLabel: `${rule.label}: ${Math.round(ratio * 100)}%`,
            detail: `${formatAmount(rule.repaid)} de ${formatAmount(rule.savingsGoal)}`,
            thisMonthFormatted: formatAmount(rule.paidThisMonth),
            note:
              saved >= goal
                ? '¡Meta de ahorro cumplida!'
                : this.projection({
                    done: thisMonth,
                    target: thisMonth + (goal - saved),
                    dayOfMonth,
                    daysInMonth,
                    monthly: false,
                  }),
          };
        }
        return {
          id: rule.id,
          eyebrow: `${rule.category || 'Ahorro'} · ${sharePct}% por venta`,
          title: rule.label,
          hasGoal: false,
          ratio: 0,
          tone: 'info' as const,
          ringLabel: `${rule.label}: 0%`,
          detail: `Acumulado: ${formatAmount(rule.repaid)}`,
          thisMonthFormatted: formatAmount(rule.paidThisMonth),
          note: 'Ponle una meta en Repartos para proyectar la fecha exacta en que la alcanzas.',
        };
      });
  });

  protected onSalesGoalInput(raw: string): void {
    this.salesGoalInput = formatThousandsInput(raw);
  }

  protected async saveSalesGoal(): Promise<void> {
    const goal = normalizeDecimal(this.salesGoalInput);
    if (!goal) {
      this.goalMessage.set({
        text: 'Escribe tu meta, por ejemplo 3.000.000.',
        tone: 'bad',
      });
      return;
    }
    await this.saveGoalPayload({ monthlySalesGoal: goal }, 'Meta guardada.');
  }

  protected async clearSalesGoal(): Promise<void> {
    await this.saveGoalPayload({ monthlySalesGoal: null }, 'Meta quitada.');
  }

  private async saveGoalPayload(
    body: Record<string, unknown>,
    okText: string,
  ): Promise<void> {
    if (this.settingsBusy()) return;
    this.goalMessage.set(null);
    this.settingsBusy.set(true);
    try {
      await this.api.put(`${this.merchantPath()}/settings`, body);
      this.editingSalesGoal.set(false);
      this.goalMessage.set({ text: okText, tone: 'ok' });
      this.refresh.emit();
    } catch (err: unknown) {
      this.goalMessage.set({
        text: (err as Error)?.message || 'Error al guardar.',
        tone: 'bad',
      });
    } finally {
      this.settingsBusy.set(false);
    }
  }
}
