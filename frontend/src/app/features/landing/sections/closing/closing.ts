import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MOTION, animate, gsap } from '../../../../core/motion';
import { Doodle } from '../../../../shared/brand/doodle';
import { Logo } from '../../../../shared/brand/logo';

@Component({
  selector: 'app-closing',
  imports: [Doodle, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="closing" aria-labelledby="closing-title">
      <div class="wrap inner">
        <app-doodle class="closing-doodle" name="ahorro" />
        <h2 id="closing-title">Echada pa’ lante, como tú</h2>
        <p class="lead">
          Registra tu negocio con la billetera y el celular que ya tienes. Autorizas una sola vez y
          desde la próxima venta todo se reparte solo.
        </p>
        <div class="actions">
          <a class="button" href="/onboard.html">Registrar mi negocio</a>
          <a class="button button-ghost" href="/merchant.html">Abrir mi caja</a>
        </div>
      </div>
    </section>
    <footer class="footer">
      <div class="wrap footer-inner">
        <app-logo class="footer-logo" />
        <p>Hecho en Medellín para el Open Payments Hackathon 2026.</p>
        <a class="footer-link" href="/sandbox.html">Sandbox para desarrolladores</a>
      </div>
    </footer>
  `,
  styleUrl: './closing.scss',
})
export class Closing {
  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        gsap
          .timeline({ scrollTrigger: { trigger: '.closing', start: 'top 70%' } })
          .from('.closing-doodle', { y: -80, rotation: 25, opacity: 0, ease: 'bounce.out', duration: 1 })
          .from('.inner > :not(.closing-doodle)', { y: 24, opacity: 0, stagger: 0.1 }, '<0.3');
      }),
    );
  }
}
