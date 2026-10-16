import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MOTION, SplitText, animate, gsap } from '../../../../core/motion';
import { Doodle } from '../../../../shared/brand/doodle';
import { MANIFESTO, SOURCES, isFigure } from './manifesto';

@Component({
  selector: 'app-purpose',
  imports: [Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './purpose.html',
  styleUrl: './purpose.scss',
})
export class Purpose {
  protected readonly manifesto = MANIFESTO;
  protected readonly sources = SOURCES;
  protected readonly isFigure = isFigure;

  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        const words = SplitText.create('.text', { type: 'words' }).words;
        gsap
          .timeline({
            scrollTrigger: { trigger: '.manifesto', start: 'top 75%', end: 'bottom 45%', scrub: 0.5 },
          })
          .from(words, { opacity: 0.12, stagger: 0.1, ease: 'none' })
          .from('.figure', { '--fill': 0, stagger: 1.4, duration: 1, ease: 'none' }, 0.6);
      }),
    );
  }
}
