import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { formatCop } from '../../../../../core/money';
import { Doodle } from '../../../../../shared/brand/doodle';

const PRICE = 13500;
const BILL = 20000;

@Component({
  selector: 'app-change-tile',
  imports: [Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Vuelto digital</h3>
    <p>¿Sin sencillo? Le das el vuelto al celular del cliente y tu efectivo pasa a ser saldo digital.</p>
    <p class="bill">Compra {{ format(price) }}, paga con {{ format(bill) }}</p>
    <div class="scene" [class.sent]="sent()">
      <app-doodle class="cash" name="pago" />
      <span class="phone" aria-live="polite">{{ sent() ? '+ ' + format(bill - price) : 'Celular' }}</span>
    </div>
    <button type="button" class="action" (click)="sent.update((s) => !s)">
      {{ sent() ? 'Repetir' : 'Dar el vuelto' }}
    </button>
  `,
  styles: `
    :host { display: grid; gap: .8rem; align-content: start; }
    .bill { font-size: .9rem; opacity: .8; }
    .scene { position: relative; display: flex; align-items: center; justify-content: space-between; height: 64px; }
    .cash { width: 56px; color: var(--lima); transition: transform .6s cubic-bezier(.65, 0, .35, 1), opacity .6s; }
    .phone {
      display: grid; place-items: center; min-width: 96px; height: 56px; padding: 0 .6rem; border-radius: 14px;
      border: 2px solid var(--lima); font-weight: 800; transition: background-color .3s .45s, color .3s .45s;
    }
    .sent .cash { transform: translateX(130px) scale(.4); opacity: 0; }
    .sent .phone { background: var(--lima); color: var(--monte); }
    .action {
      justify-self: start; min-height: 44px; padding: 0 1.1rem; border-radius: 999px; border: 0; cursor: pointer;
      background: var(--papel); color: var(--monte); font: 700 .95rem var(--sans);
    }
  `,
})
export class ChangeTile {
  protected readonly price = PRICE;
  protected readonly bill = BILL;
  protected readonly format = formatCop;
  protected readonly sent = signal(false);
}
