import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MOTION, animate, gsap } from '../../../../core/motion';
import { Plant } from './plant';

const DAYS = 30;

@Component({
  selector: 'app-preview',
  imports: [Plant],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './preview.html',
  styleUrl: './preview.scss',
})
export class Preview {
  protected readonly stages = [
    { name: 'Semilla', text: 'Empieza el mes y tus bolsillos arrancan en ceros.' },
    { name: 'Brote', text: 'Con cada venta, tus bolsillos se van llenando.' },
    { name: 'En flor', text: 'Proveedor pago, préstamo al día y ahorro guardado.' },
  ];
  protected readonly goals = [
    { name: 'Proveedores', reached: 1 },
    { name: 'Fondo Anti‑Gota', reached: 1 },
    { name: 'Ahorro', reached: 0.8 },
  ];
  protected readonly activeStage = signal(2);

  constructor() {
    animate((mm, root) =>
      mm.add(MOTION, () => {
        this.activeStage.set(0);
        const day = root.querySelector('.day-number')!;
        const clock = { day: 1 };
        day.textContent = '1';

        gsap
          .timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: '.preview',
              start: 'center center',
              end: '+=1600',
              pin: '.preview',
              scrub: 0.5,
              onUpdate: ({ progress }) => this.activeStage.set(progress < 0.33 ? 0 : progress < 0.75 ? 1 : 2),
            },
          })
          .to(clock, { day: DAYS, duration: 1, onUpdate: () => (day.textContent = String(Math.round(clock.day))) }, 0)
          .from('.bar-fill', { scaleX: 0, duration: 0.9, stagger: 0.05 }, 0)
          .from('.stem', { drawSVG: 0, duration: 0.35 }, 0.1)
          .to('.seed', { scale: 0, transformOrigin: '50% 50%', duration: 0.1 }, 0.2)
          .from('.leaf-left', { scale: 0, transformOrigin: '100% 50%', duration: 0.15, ease: 'back.out(2)' }, 0.3)
          .from('.leaf-right', { scale: 0, transformOrigin: '0% 50%', duration: 0.15, ease: 'back.out(2)' }, 0.42)
          .from('.flower', { scale: 0, rotation: -90, svgOrigin: '100 70', duration: 0.2, ease: 'back.out(1.6)' }, 0.75)
          .from('.sparks path', { drawSVG: 0, opacity: 0, duration: 0.1 }, 0.92);
      }),
    );
  }
}
