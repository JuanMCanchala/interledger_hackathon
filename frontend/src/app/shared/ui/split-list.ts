import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RuleView, SettlementItemView, SettlementView } from '../../core/miplante.models';
import {
  ITEM_STATUS,
  RULE_KIND,
  badgeClass,
  formatAmount,
  statusInfo,
  toNumber,
} from '../../core/miplante.utils';

@Component({
  selector: 'app-split-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="split">
      @if (settlement()?.kept; as kept) {
        <li class="split-item is-kept is-entering">
          <span class="split-label">{{ keptLabel() }}</span>
          <span class="split-amount">{{ formatAmount(kept) }}</span>
        </li>
      }
      @for (row of rows(); track $index) {
        <li class="split-item is-entering" [style.animation-delay]="($index + 1) * 140 + 'ms'">
          <span class="split-label">{{ row.item.label }}</span>
          <span class="split-amount">{{ formatAmount(row.item.amount) }}</span>
          <div class="split-meta">
            <span>{{ ruleKind(row.item.kind) }}</span>
            <span [class]="row.statusBadgeClass">{{ row.statusText }}</span>
            @if (row.item.capped && row.item.status !== 'skipped') {
              <span class="badge">Límite mensual alcanzado</span>
            }
            @if (row.item.error) {
              <span class="error-text">{{ row.item.error }}</span>
            }
          </div>
          @if (row.detail) {
            <p class="split-detail small muted">{{ row.detail }}</p>
          }
        </li>
      }
    </ul>
  `,
})
export class SplitList {
  readonly settlement = input<SettlementView | undefined>(undefined);
  readonly keptLabel = input<string>('Tú te quedas');
  readonly rules = input<RuleView[] | undefined>(undefined);

  protected readonly formatAmount = formatAmount;

  protected ruleKind(kind: string): string {
    return RULE_KIND[kind] || kind;
  }

  protected readonly rows = computed(() => {
    const items = this.settlement()?.items ?? [];
    const rules = this.rules() ?? [];
    return items.map((item) => {
      const info = statusInfo(ITEM_STATUS, item.status);
      return {
        item,
        statusText: info.text,
        statusBadgeClass: badgeClass(info.tone),
        detail: this.computeDetail(item, rules),
      };
    });
  });

  private computeDetail(item: SettlementItemView, rules: RuleView[]): string {
    if (item.status !== 'reserved' || !rules.length) return '';
    const rule = rules.find((r) =>
      item.ruleId ? r.id === item.ruleId : r.label === item.label && r.kind === 'debt',
    );
    if (!rule) return '';
    const quota = toNumber(rule.monthlyQuota);
    const progress =
      quota > 0 && toNumber(rule.paidThisMonth) >= quota
        ? 'Cuota del mes completa'
        : `Cuota del mes: ${formatAmount(rule.paidThisMonth)} de ${formatAmount(rule.monthlyQuota)}`;
    return `${progress} · ${this.dueText(rule)}`;
  }

  private dueText(rule: RuleView): string {
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
}
