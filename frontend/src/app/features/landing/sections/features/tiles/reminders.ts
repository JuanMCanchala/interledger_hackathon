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
    <h3>Recordatorios en tu celular</h3>
    <p>Te avisa antes de cada pago y te cuenta cómo van tus bolsillos.</p>
    <ul class="stack" aria-live="polite">
      @for (message of shown(); track message.id) {
        <li class="push"><strong>MiPlante</strong>{{ message.text }}</li>
      }
    </ul>
    <button type="button" class="action" data-cursor="Avisar" (click)="next()">Recibir un aviso</button>
  `,
  styles: `
    :host { display: grid; gap: .8rem; align-content: start; }
    .stack { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; min-height: 9.5rem; align-content: start; }
    .push {
      display: grid; padding: .6rem .8rem; border-radius: 14px; font-size: .85rem; line-height: 1.35;
      background: var(--papel); color: var(--tinta); animation: drop-in .5s cubic-bezier(.34, 1.56, .64, 1);
    }
    .push + .push { opacity: .6; }
    strong { font-size: .75rem; color: var(--monte); }
    .action {
      justify-self: start; min-height: 44px; padding: 0 1.1rem; border-radius: 999px; border: 0; cursor: pointer;
      background: var(--lima); color: var(--monte); font: 700 .95rem var(--sans);
    }
    @keyframes drop-in { from { transform: translateY(-16px) scale(.96); opacity: 0; } }
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
