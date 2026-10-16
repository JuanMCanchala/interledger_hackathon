import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MOTION, animate, gsap } from '../../../../../core/motion';

@Component({
  selector: 'app-history-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Tu historial cuenta</h3>
    <p>Cada venta y cada pago quedan anotados. Con ese historial puedes pedir un crédito formal.</p>
    <div class="feed" aria-hidden="true">
      <ul class="feed-track">
        @for (copy of [0, 1]; track copy) {
          @for (entry of entries; track entry) {
            <li>{{ entry }}</li>
          }
        }
      </ul>
    </div>
  `,
  styles: `
    :host { display: grid; gap: .8rem; align-content: start; }
    .feed {
      height: 120px; overflow: hidden;
      mask: linear-gradient(transparent, #000 25%, #000 75%, transparent);
    }
    .feed-track { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
    li { padding: .45rem .75rem; border-radius: 8px; background: rgb(253 251 251 / 8%); font-size: .85rem; }
    li::before { content: '● '; color: var(--lima); }
  `,
})
export class HistoryTile {
  protected readonly entries = [
    'Venta $ 12.000 en efectivo',
    'Abono al préstamo $ 600',
    'Venta $ 35.000 con celular',
    'Pago a proveedor $ 3.500',
    'Ahorro $ 1.750',
  ];

  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        gsap.to('.feed-track', { yPercent: -50, ease: 'none', duration: 12, repeat: -1 });
      }),
    );
  }
}
