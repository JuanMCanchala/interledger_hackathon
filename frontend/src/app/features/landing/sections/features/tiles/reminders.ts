import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

const MESSAGES = [
  'Mañana viene el proveedor: ya tienes $ 45.000 guardados.',
  'Vas en 80 % de tu ahorro del mes. ¡Pa’ lante!',
  'Ya completaste la cuota del mes de tu proveedor.',
  'Esta semana abonaste $ 9.600 a tu préstamo.',
];
const VISIBLE = 2;

@Component({
  selector: 'app-reminders-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Avisos en tu caja</h3>
    <p>Cada vez que abres MiPlante, en Avisos ves lo que viene: el próximo pago y cómo van tus bolsillos.</p>
    <ul class="stack" aria-live="polite" aria-label="Avisos de ejemplo">
      @for (message of shown(); track message.id) {
        <li class="notice">{{ message.text }}</li>
      }
    </ul>
    <button type="button" class="action" data-cursor="Ver" (click)="next()">Ver otro aviso</button>
  `,
  styles: `
    :host { display: grid; gap: .8rem; align-content: start; }
    .stack { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; min-height: 9.5rem; align-content: start; }
    .notice {
      padding: .6rem .8rem; border-left: 4px solid var(--lima); border-radius: 6px 12px 12px 6px;
      font-size: .85rem; line-height: 1.35; background: var(--papel); color: var(--tinta);
      animation: slide-in .4s ease-out;
    }
    .notice + .notice { opacity: .6; }
    .action {
      justify-self: start; min-height: 44px; padding: 0 1.1rem; border-radius: 999px; border: 0; cursor: pointer;
      background: var(--lima); color: var(--monte); font: 700 .95rem var(--sans);
    }
    @keyframes slide-in { from { transform: translateX(-12px); opacity: 0; } }
  `,
})
export class RemindersTile {
  private count = 1;
  protected readonly shown = signal([{ id: 0, text: MESSAGES[0] }]);

  protected next(): void {
    const id = this.count++;
    this.shown.update((list) => [{ id, text: MESSAGES[id % MESSAGES.length] }, ...list].slice(0, VISIBLE));
  }
}
