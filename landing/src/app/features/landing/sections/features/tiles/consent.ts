import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: 'app-consent-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Das permiso una sola vez</h3>
    <p>Tú decides cuánto se puede mover al día y a dónde va cada venta. Lo cambias o lo cancelas cuando quieras.</p>
    <button type="button" role="switch" class="switch" [attr.aria-checked]="allowed()" (click)="allowed.update((on) => !on)">
      <span class="knob" aria-hidden="true"></span>
      {{ allowed() ? 'Permiso activo' : 'Dar permiso' }}
    </button>
    <ul class="limits" [class.on]="allowed()">
      @for (limit of limits; track limit) {
        <li>{{ limit }}</li>
      }
    </ul>
  `,
  styles: `
    :host { display: grid; gap: 1rem; align-content: start; }
    .switch {
      display: inline-flex; align-items: center; gap: .75rem; justify-self: start;
      min-height: 48px; padding: .4rem 1.1rem .4rem .4rem; border: 0; border-radius: 999px;
      background: var(--monte-hondo); color: var(--papel); font: 700 1rem var(--sans); cursor: pointer;
    }
    .knob {
      width: 56px; height: 32px; border-radius: 999px; background: rgb(253 251 251 / 20%); position: relative;
      transition: background-color .3s;
    }
    .knob::after {
      content: ''; position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; border-radius: 50%;
      background: var(--papel); transition: transform .35s cubic-bezier(.34, 1.56, .64, 1);
    }
    [aria-checked='true'] .knob { background: var(--lima); }
    [aria-checked='true'] .knob::after { transform: translateX(24px); background: var(--monte); }
    .limits { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
    li {
      padding: .55rem .9rem; border-radius: 10px; background: rgb(9 70 65 / 8%);
      opacity: .35; transform: translateX(-6px); transition: opacity .3s, transform .3s, background-color .3s;
    }
    li::before { content: '✓ '; font-weight: 800; }
    .on li { opacity: 1; transform: none; background: rgb(9 70 65 / 16%); }
    .on li:nth-child(2) { transition-delay: .08s; }
    .on li:nth-child(3) { transition-delay: .16s; }
  `,
})
export class ConsentTile {
  protected readonly allowed = signal(false);
  protected readonly limits = ['Hasta $ 30.000 al día', 'Solo hacia tus bolsillos', 'Lo cancelas cuando quieras'];
}
