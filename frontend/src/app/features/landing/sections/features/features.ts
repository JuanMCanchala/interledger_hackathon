import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FINE_POINTER, animate } from '../../../../core/motion';
import { ConsentTile } from './tiles/consent';
import { CurrenciesTile } from './tiles/currencies';
import { ElasticTile } from './tiles/elastic';
import { HistoryTile } from './tiles/history';
import { NetworkTile } from './tiles/network';
import { RemindersTile } from './tiles/reminders';

@Component({
  selector: 'app-features',
  imports: [NetworkTile, ConsentTile, CurrenciesTile, ElasticTile, HistoryTile, RemindersTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="features" id="funciones" aria-labelledby="features-title">
      <div class="wrap">
        <header class="intro">
          <h2 id="features-title">Lo que MiPlante hace por tu negocio</h2>
          <p class="lead">Tú vendes como siempre. Lo demás pasa solo, en el celular que ya tienes. Toca cada cuadro para probarlo.</p>
        </header>
        <div class="bento">
          <article class="tile network"><app-network-tile /></article>
          <article class="tile consent"><app-consent-tile /></article>
          <article class="tile currencies"><app-currencies-tile /></article>
          <article class="tile elastic"><app-elastic-tile /></article>
          <article class="tile history"><app-history-tile /></article>
          <article class="tile reminders"><app-reminders-tile /></article>
        </div>
      </div>
    </section>
  `,
  styleUrl: './features.scss',
})
export class Features {
  constructor() {
    animate((mm, root) => {
      mm.add(FINE_POINTER, () => {
        const spotlight = (e: PointerEvent) => {
          const tile = (e.target as Element).closest<HTMLElement>('.tile');
          if (!tile) return;
          const box = tile.getBoundingClientRect();
          tile.style.setProperty('--mx', `${e.clientX - box.left}px`);
          tile.style.setProperty('--my', `${e.clientY - box.top}px`);
        };
        root.addEventListener('pointermove', spotlight);
        return () => root.removeEventListener('pointermove', spotlight);
      });
    });
  }
}
