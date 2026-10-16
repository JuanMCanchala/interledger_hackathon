import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MOTION, animate, gsap } from '../../../../core/motion';
import { Doodle } from '../../../../shared/brand/doodle';
import { STATS } from './stats';

const number = (value: number, decimals = 0) =>
  value.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

@Component({
  selector: 'app-purpose',
  imports: [Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './purpose.html',
  styleUrl: './purpose.scss',
})
export class Purpose {
  protected readonly stats = STATS;
  protected readonly format = number;

  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        gsap.from('.intro-doodle', {
          rotation: -12,
          y: 30,
          opacity: 0,
          scrollTrigger: { trigger: '.intro', start: 'top 70%' },
        });

        gsap.utils.toArray<HTMLElement>('.row').forEach((row) => {
          const count = row.querySelector<HTMLElement>('.count')!;
          const target = Number(count.dataset['value']);
          const decimals = Number(count.dataset['decimals']);
          const counter = { value: 0 };

          gsap
            .timeline({ scrollTrigger: { trigger: row, start: 'top 85%' } })
            .from(row, { '--rule': 0, duration: 0.8, ease: 'power2.out' })
            .from(row.querySelectorAll('.text, .source'), { y: 14, opacity: 0, stagger: 0.08 }, '<0.2')
            .to(counter, {
              value: target,
              duration: 1.2,
              ease: 'power2.out',
              onUpdate: () => (count.textContent = number(counter.value, decimals)),
            }, 0);
        });
      }),
    );
  }
}
