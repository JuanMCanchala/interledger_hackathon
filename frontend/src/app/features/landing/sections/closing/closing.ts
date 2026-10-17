import { APP_LINKS } from '../../../../core/app-links';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MOTION, animate, gsap } from '../../../../core/motion';
import { Doodle } from '../../../../shared/brand/doodle';
import { Logo } from '../../../../shared/brand/logo';

@Component({
  selector: 'app-closing',
  imports: [Doodle, Logo, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="closing" aria-labelledby="closing-title">
      <div class="wrap inner">
        <app-doodle class="closing-doodle" name="ahorro" />
        <h2 id="closing-title">Echada pa’ lante, como tú</h2>
        <p class="lead">
          MiPlante ya funciona sobre la red de prueba de Interledger. Registra tu negocio y cobra
          con el celular que ya tienes.
        </p>
        <div class="actions">
          <a class="button" [routerLink]="app.register">Registra tu negocio</a>
          <a class="button button-ghost" [routerLink]="app.till">Abrir mi caja</a>
        </div>
        <a class="again" href="#caja">Volver a probar la caja</a>
      </div>
    </section>
    <footer class="footer">
      <div class="wrap footer-inner">
        <app-logo class="footer-logo" />
        <p>Hecho en Medellín para el Open Payments Hackathon 2026.</p>
      </div>
    </footer>
  `,
  styleUrl: './closing.scss',
})
export class Closing {
  protected readonly app = APP_LINKS;

  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        gsap
          .timeline({ scrollTrigger: { trigger: '.closing', start: 'top 70%' } })
          .from('.closing-doodle', {
            y: -80,
            rotation: 25,
            opacity: 0,
            ease: 'bounce.out',
            duration: 1,
          })
          .from('.inner > :not(.closing-doodle)', { y: 24, opacity: 0, stagger: 0.1 }, '<0.3');
      }),
    );
  }
}
