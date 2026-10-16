import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { formatCop } from '../../../../../core/money';

/** Example rates for the demo only. */
const CURRENCIES = [
  { code: 'USD', amount: 10, pesosPerUnit: 4000 },
  { code: 'EUR', amount: 10, pesosPerUnit: 4500 },
  { code: 'MXN', amount: 200, pesosPerUnit: 220 },
];

@Component({
  selector: 'app-currencies-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Te pagan desde cualquier país</h3>
    <div class="chips" role="group" aria-label="Moneda del turista">
      @for (c of currencies; track c.code; let i = $index) {
        <button type="button" [attr.aria-pressed]="i === selected()" (click)="selected.set(i)">{{ c.code }}</button>
      }
    </div>
    <p class="convert" aria-live="polite">
      <span>{{ current().amount }} {{ current().code }}</span>
      <span class="arrow" aria-hidden="true">↓</span>
      <strong>{{ pesos() }}</strong>
    </p>
    <p class="note">Tú siempre recibes pesos. Tasas de ejemplo.</p>
  `,
  styles: `
    :host { display: grid; gap: .8rem; align-content: start; }
    .chips { display: flex; gap: .4rem; }
    button {
      min-width: 44px; min-height: 40px; padding: 0 .8rem; border-radius: 999px; cursor: pointer;
      border: 2px solid rgb(204 241 55 / 40%); background: none; color: inherit; font: 700 .85rem var(--sans);
    }
    [aria-pressed='true'] { background: var(--lima); border-color: var(--lima); color: var(--monte); }
    .convert { display: grid; font-size: 1.1rem; }
    .arrow { color: var(--lima); }
    strong { font-size: 1.8rem; line-height: 1.1; }
    .note { font-size: .8rem; opacity: .7; }
  `,
})
export class CurrenciesTile {
  protected readonly currencies = CURRENCIES;
  protected readonly selected = signal(0);
  protected readonly current = computed(() => CURRENCIES[this.selected()]);
  protected readonly pesos = computed(() => formatCop(this.current().amount * this.current().pesosPerUnit));
}
