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
import { MerchantDashboard, PayoutView, RuleView } from '../../../core/miplante.models';
import {
  MAX_RULES,
  MAX_TOTAL_PERCENT,
  PAYOUT_STATUS,
  RULE_KIND,
  badgeClass,
  formatAmount,
  formatMoney,
  formatTime,
  normalizeDecimal,
  normalizeWallet,
  previewSplit,
  statusInfo,
  toDecimal,
  toMinor,
  toNumber,
  walletName,
} from '../../../core/miplante.utils';
import { BannerMessage, TabName } from '../merchant.types';

interface RuleDraft {
  key: number;
  id?: string;
  storedOutstanding?: string;
  label: string;
  category: string;
  kind: 'debt' | 'savings';
  sharePercent: number | null;
  monthlyQuota: string;
  outstanding: string;
  savingsGoal: string;
  dueDay: number | null;
  destination: string;
}

let nextRuleDraftKey = 1;

@Component({
  selector: 'app-merchant-repartos',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './merchant-repartos.html',
})
export class MerchantRepartos {
  private readonly api = inject(ApiService);

  readonly merchant = input.required<MerchantDashboard>();
  readonly merchantPath = input.required<string>();
  readonly startInEditor = input<boolean>(false);

  readonly refresh = output<void>();
  readonly navigateTab = output<TabName>();
  readonly editorOpened = output<void>();

  protected readonly formatAmount = formatAmount;
  protected readonly formatTime = formatTime;
  protected readonly toNumber = toNumber;
  protected readonly walletName = walletName;
  protected readonly maxRules = MAX_RULES;

  protected readonly editingRules = signal(false);
  protected readonly ruleDrafts = signal<RuleDraft[]>([]);
  protected readonly rulesError = signal('');
  protected readonly rulesSavedMsg = signal('');
  protected readonly rulesSaving = signal(false);
  protected readonly payoutBusy = signal(false);
  protected readonly payoutMessage = signal<BannerMessage | null>(null);
  protected readonly simulateMessage = signal<BannerMessage | null>(null);

  constructor() {
    effect(() => {
      if (this.startInEditor()) {
        untracked(() => {
          this.openRulesEditor();
          this.editorOpened.emit();
        });
      }
    });
  }

  private money(value: number): string {
    const asset = this.merchant().asset ?? { assetCode: 'COP', assetScale: 2 };
    return formatMoney(value, asset.assetCode, asset.assetScale);
  }

  protected readonly repartosStats = computed(() => {
    const m = this.merchant();
    const allocatedBps = m.rules.reduce((sum, r) => sum + r.shareBps, 0);
    const allocatedPct = allocatedBps / 100;
    const keptPct = Math.max(0, 100 - allocatedPct);
    const reservedTotal = m.rules
      .filter((r) => r.kind === 'debt')
      .reduce((sum, r) => sum + toNumber(r.reserved), 0);
    const paidMonthTotal = m.rules.reduce(
      (sum, r) => sum + toNumber(r.paidThisMonth),
      0,
    );
    return {
      allocatedPctText: allocatedPct.toLocaleString('es-CO', {
        maximumFractionDigits: 2,
      }),
      keptPctText: keptPct.toLocaleString('es-CO', {
        maximumFractionDigits: 2,
      }),
      reservedTotalFormatted: this.money(reservedTotal),
      paidMonthTotalFormatted: this.money(paidMonthTotal),
      debtCount: m.rules.filter((r) => r.kind === 'debt').length,
      savingsCount: m.rules.filter((r) => r.kind === 'savings').length,
    };
  });

  protected readonly groupedRules = computed(() => {
    const m = this.merchant();
    const groups = new Map<string, RuleView[]>();
    for (const rule of m.rules) {
      const name = rule.category || RULE_KIND[rule.kind] || rule.kind;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(rule);
    }
    return [...groups.entries()].map(([name, rules]) => ({ name, rules }));
  });

  protected readonly rulesPreview = computed(() => {
    const m = this.merchant();
    const scale = m.asset.assetScale ?? 2;
    const code = m.asset.assetCode ?? 'COP';
    const fmtMinor = (minor: bigint) => formatMoney(Number(minor) / 10 ** scale, code);

    const drafts = this.ruleDrafts();
    const parsed = drafts.map((d) => {
      const p =
        d.sharePercent !== null && Number.isFinite(Number(d.sharePercent))
          ? Math.round(Number(d.sharePercent) * 100) / 100
          : NaN;
      const quotaDec = d.kind === 'debt' ? normalizeDecimal(d.monthlyQuota) : '';
      const outDec = d.kind === 'debt' ? normalizeDecimal(d.outstanding) : '';
      return { ...d, shareNum: p, quotaDec, outDec };
    });

    const valid = parsed.filter((r) => Number.isFinite(r.shareNum) && r.shareNum > 0);
    const saleMinor = toMinor('10000', scale);
    const split = previewSplit(
      saleMinor,
      valid.map((r) => ({
        label: r.label.trim() || (r.kind === 'debt' ? 'Crédito' : 'Ahorro'),
        kind: r.kind,
        shareBps: Math.round(r.shareNum * 100),
        outstandingMinor: r.outDec ? toMinor(r.outDec, scale) : undefined,
      })),
    );

    const parts = [
      `tú recibes ${fmtMinor(split.kept)}`,
      ...split.items.map((item) => `${item.label} ${fmtMinor(item.amount)}`),
    ];
    const sentence = `Por una venta de ${fmtMinor(saleMinor)}: ${parts.join(' · ')}`;
    const pct = (minor: bigint) => (Number(minor) * 100) / Number(saleMinor);

    const totalPercent = valid.reduce((sum, r) => sum + r.shareNum, 0);
    const overLimit = totalPercent > MAX_TOTAL_PERCENT;
    const warning = overLimit
      ? `Las reglas suman ${totalPercent.toLocaleString('es-CO')}%. El máximo es ${MAX_TOTAL_PERCENT}% para que siempre te quede una parte de cada venta.`
      : '';

    const capMinor = BigInt(m.monthlyCap.value);
    const quotasMinor = parsed
      .filter((r) => r.kind === 'debt' && r.quotaDec)
      .reduce((sum, r) => sum + toMinor(r.quotaDec, scale), 0n);
    const overCap = quotasMinor > capMinor;
    const capWarning = overCap
      ? `Las cuotas del mes suman ${fmtMinor(quotasMinor)}, más que tu límite mensual de ${fmtMinor(capMinor)}. Baja alguna cuota.`
      : '';

    return {
      sentence,
      keptPercent: pct(split.kept),
      keptFormatted: fmtMinor(split.kept),
      items: split.items.map((item) => ({
        label: item.label,
        kind: item.kind,
        widthPercent: pct(item.amount),
        formatted: fmtMinor(item.amount),
      })),
      totalPercent,
      overLimit,
      overCap,
      warning,
      capWarning,
    };
  });

  protected ruleKindLabel(kind: string): string {
    return RULE_KIND[kind] || kind;
  }

  protected debtProgress(rule: RuleView): number {
    const quota = toNumber(rule.monthlyQuota);
    const paid = toNumber(rule.paidThisMonth);
    return quota > 0 ? Math.min(100, (paid / quota) * 100) : 0;
  }

  protected savingsProgress(rule: RuleView): number {
    const goal = toNumber(rule.savingsGoal);
    const repaid = toNumber(rule.repaid);
    return goal > 0 ? Math.min(100, (repaid / goal) * 100) : 0;
  }

  protected dueText(rule: RuleView): string {
    const day = rule.dueDay ?? 28;
    const today = new Date();
    const paidThisMonth =
      toNumber(rule.paidOutThisMonth) > 0 && toNumber(rule.reserved) <= 0;
    const next =
      today.getDate() <= day && !paidThisMonth
        ? new Date(today.getFullYear(), today.getMonth(), day)
        : new Date(today.getFullYear(), today.getMonth() + 1, day);
    return `Se le paga el ${next.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}.`;
  }

  protected payoutStatusText(status: string): string {
    return statusInfo(PAYOUT_STATUS, status).text;
  }

  protected payoutStatusBadgeClass(status: string): string {
    return badgeClass(statusInfo(PAYOUT_STATUS, status).tone);
  }

  protected formatShortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
    });
  }

  protected openRulesEditor(): void {
    const m = this.merchant();
    this.ruleDrafts.set(
      m.rules.map((r) => ({
        key: nextRuleDraftKey++,
        id: r.id,
        storedOutstanding: normalizeDecimal(toDecimal(r.outstanding)),
        label: r.label,
        category: r.category || '',
        kind: r.kind,
        sharePercent: r.shareBps / 100,
        monthlyQuota: toDecimal(r.monthlyQuota),
        outstanding: toDecimal(r.outstanding),
        savingsGoal: toDecimal(r.savingsGoal),
        dueDay: r.dueDay ?? (r.kind === 'debt' ? 28 : null),
        destination: walletName(r.destination),
      })),
    );
    this.rulesError.set('');
    this.rulesSavedMsg.set('');
    this.editingRules.set(true);
  }

  protected addRuleDraft(): void {
    if (this.ruleDrafts().length >= MAX_RULES) return;
    this.ruleDrafts.update((list) => [
      ...list,
      {
        key: nextRuleDraftKey++,
        label: 'Proveedor',
        category: 'Proveedores',
        kind: 'debt',
        sharePercent: null,
        monthlyQuota: '',
        outstanding: '',
        savingsGoal: '',
        dueDay: 25,
        destination: '',
      },
    ]);
  }

  protected removeRuleDraft(key: number): void {
    if (this.ruleDrafts().length <= 1) return;
    this.ruleDrafts.update((list) => list.filter((d) => d.key !== key));
  }

  protected updateRuleDraft(key: number, patch: Partial<RuleDraft>): void {
    this.ruleDrafts.update((list) =>
      list.map((d) => {
        if (d.key !== key) return d;
        const updated = { ...d, ...patch };
        if (patch.kind === 'debt' && !updated.dueDay) {
          updated.dueDay = 28;
        }
        return updated;
      }),
    );
  }

  private collectRulesPayload(): Record<string, unknown>[] {
    const preview = this.rulesPreview();
    if (preview.overLimit) {
      throw new Error(
        `La suma de porcentajes no puede pasar de ${MAX_TOTAL_PERCENT}%.`,
      );
    }
    if (preview.overCap) {
      throw new Error(
        'Las cuotas del mes no pueden sumar más que tu límite mensual.',
      );
    }

    return this.ruleDrafts().map((d, index) => {
      const position = `Regla ${index + 1}`;
      const label = d.label.trim();
      const category = d.category.trim();
      const dest = d.destination.trim();
      const sharePercent =
        d.sharePercent !== null && Number.isFinite(Number(d.sharePercent))
          ? Math.round(Number(d.sharePercent) * 100) / 100
          : NaN;

      if (!label) throw new Error(`${position}: escribe un nombre`);
      if (!category) {
        throw new Error(`${position}: escribe su categoría, por ejemplo Proveedores`);
      }
      if (!dest) throw new Error(`${position}: escribe la billetera de destino`);
      if (
        !Number.isFinite(sharePercent) ||
        sharePercent < 0.01 ||
        sharePercent > MAX_TOTAL_PERCENT
      ) {
        throw new Error(
          `${position}: el porcentaje debe estar entre 0,01 y ${MAX_TOTAL_PERCENT}`,
        );
      }

      const monthlyQuota = d.kind === 'debt' ? normalizeDecimal(d.monthlyQuota) : '';
      const outstanding = d.kind === 'debt' ? normalizeDecimal(d.outstanding) : '';
      const savingsGoal = d.kind === 'savings' ? normalizeDecimal(d.savingsGoal) : '';

      if (d.kind === 'debt' && d.monthlyQuota.trim() && !monthlyQuota) {
        throw new Error(`${position}: revisa la cuota del mes, por ejemplo 200.000`);
      }
      if (d.kind === 'debt' && d.outstanding.trim() && !outstanding) {
        throw new Error(`${position}: revisa la deuda total, por ejemplo 200.000`);
      }
      if (d.kind === 'savings' && d.savingsGoal.trim() && !savingsGoal) {
        throw new Error(`${position}: revisa la meta de ahorro, por ejemplo 200.000`);
      }
      if (d.kind === 'debt' && !monthlyQuota) {
        throw new Error(`${position}: escribe la cuota del mes, por ejemplo 200.000`);
      }

      const untouched =
        Boolean(d.id) &&
        d.kind === 'debt' &&
        outstanding === (d.storedOutstanding ?? '');

      const body: Record<string, unknown> = {
        label,
        category,
        kind: d.kind,
        destination: normalizeWallet(dest),
        sharePercent,
      };
      if (d.id) body['id'] = d.id;
      if (d.kind === 'debt') {
        const dueDay = d.dueDay !== null ? Number(d.dueDay) : NaN;
        if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
          throw new Error(`${position}: el día de pago va del 1 al 28`);
        }
        body['monthlyQuota'] = monthlyQuota;
        body['dueDay'] = dueDay;
      }
      if (d.kind === 'savings' && savingsGoal) {
        body['savingsGoal'] = savingsGoal;
      }
      if (d.kind === 'debt' && !untouched && outstanding) {
        body['outstanding'] = outstanding;
      }
      return body;
    });
  }

  protected async saveRules(): Promise<void> {
    if (this.rulesSaving()) return;
    this.rulesError.set('');
    let rules: Record<string, unknown>[];
    try {
      rules = this.collectRulesPayload();
    } catch (err: unknown) {
      this.rulesError.set((err as Error)?.message || 'Revisa los repartos.');
      return;
    }

    this.rulesSaving.set(true);
    try {
      await this.api.put(`${this.merchantPath()}/rules`, { rules });
      this.editingRules.set(false);
      this.rulesSavedMsg.set('Listo: tus próximas ventas se reparten así.');
      this.refresh.emit();
    } catch (err: unknown) {
      this.rulesError.set((err as Error)?.message || 'No pudimos guardar los repartos.');
    } finally {
      this.rulesSaving.set(false);
    }
  }

  protected async runManualPayout(ruleId: string): Promise<void> {
    await this.executePayout({ ruleId, reason: 'manual' }, this.payoutMessage);
  }

  protected async simulateDueDate(): Promise<void> {
    await this.executePayout({ reason: 'due-date' }, this.simulateMessage);
  }

  private async executePayout(
    body: Record<string, unknown>,
    targetSignal: typeof this.payoutMessage,
  ): Promise<void> {
    if (this.payoutBusy()) return;
    targetSignal.set(null);
    this.payoutBusy.set(true);
    try {
      const { payouts } = await this.api.post<{ payouts: PayoutView[] }>(
        `${this.merchantPath()}/payouts`,
        body,
      );
      const sent = payouts.filter((p) => p.status !== 'failed');
      const failed = payouts.filter((p) => p.status === 'failed');
      const text = [
        sent.length
          ? `Enviado: ${sent.map((p) => `${p.label} ${formatAmount(p.amount)}`).join(' · ')}.`
          : '',
        failed.length
          ? `No se pudo enviar a ${failed.map((p) => p.label).join(', ')}: el dinero sigue apartado.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      targetSignal.set({
        text: text || 'No había pagos pendientes por enviar.',
        tone: failed.length ? 'bad' : 'ok',
      });
      this.refresh.emit();
    } catch (err: unknown) {
      targetSignal.set({
        text: (err as Error)?.message || 'Error al enviar el pago.',
        tone: 'bad',
      });
    } finally {
      this.payoutBusy.set(false);
    }
  }
}
