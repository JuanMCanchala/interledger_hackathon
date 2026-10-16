import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { formatCop } from '../../../../../core/money';
import { splitSale } from '../../../domain/pockets';

const ANTI_GOTA = 2;

@Component({
  selector: 'app-elastic-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Pagas según vendes</h3>
    <p>Tu préstamo se abona con una parte de cada venta, no con una cuota fija.</p>
    <div class="chart" role="group" aria-label="Ventas de la semana">
      @for (day of days; track day.name; let i = $index) {
        <button
          type="button"
          class="day"
          [attr.aria-pressed]="i === selected()"
          [attr.aria-label]="day.name"
          (pointerenter)="selected.set(i)"
          (focus)="selected.set(i)"
          (click)="selected.set(i)"
        >
          <span class="bar" [style.--h]="day.sold / max"><span class="paid"></span></span>
          <span class="label">{{ day.name.slice(0, 3) }}</span>
        </button>
      }
    </div>
    <p class="caption" aria-live="polite">{{ caption() }}</p>
  `,
  styles: `
    :host { display: grid; gap: .8rem; align-content: start; }
    .chart { display: grid; grid-template-columns: repeat(7, 1fr); gap: .4rem; height: 150px; align-items: end; }
    .day {
      display: grid; grid-template-rows: 1fr auto; gap: .3rem; height: 100%; padding: 0; border: 0;
      background: none; color: inherit; cursor: pointer; font: 500 .75rem var(--sans);
    }
    .bar {
      align-self: end; position: relative; height: max(4px, calc(var(--h) * 100%)); border-radius: 6px 6px 2px 2px;
      background: rgb(253 251 251 / 22%); transition: background-color .2s;
    }
    .paid { position: absolute; inset: auto 0 0; height: max(3px, 5%); border-radius: inherit; background: var(--lima); }
    [aria-pressed='true'] .bar { background: rgb(253 251 251 / 55%); }
    .caption { min-height: 3em; }
  `,
})
export class ElasticTile {
  protected readonly days = [
    { name: 'Lunes', sold: 85000 },
    { name: 'Martes', sold: 12000 },
    { name: 'Miércoles', sold: 140000 },
    { name: 'Jueves', sold: 30000 },
    { name: 'Viernes', sold: 0 },
    { name: 'Sábado', sold: 210000 },
    { name: 'Domingo', sold: 95000 },
  ];
  protected readonly max = Math.max(...this.days.map((d) => d.sold));
  protected readonly selected = signal(5);
  protected readonly caption = computed(() => {
    const day = this.days[this.selected()];
    if (!day.sold) return `${day.name}: no vendiste, así que no pagaste nada.`;
    return `${day.name}: vendiste ${formatCop(day.sold)} y abonaste ${formatCop(splitSale(day.sold)[ANTI_GOTA])}.`;
  });
}
