import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MOTION, WIDE, animate, gsap } from '../../../../core/motion';
import { Doodle } from '../../../../shared/brand/doodle';
import { CHAPTERS } from './chapters';

@Component({
  selector: 'app-story',
  imports: [Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './story.html',
  styleUrl: './story.scss',
})
export class Story {
  protected readonly chapters = CHAPTERS;

  constructor() {
    animate((mm, root) =>
      mm.add({ motion: MOTION, wide: WIDE }, (ctx) => {
        const { motion, wide } = ctx.conditions!;
        if (!motion) return;

        const track = root.querySelector<HTMLElement>('.track')!;
        const scroll = wide
          ? gsap.to(track, {
              x: () => -(track.scrollWidth - window.innerWidth),
              ease: 'none',
              scrollTrigger: {
                trigger: '.story',
                pin: true,
                scrub: 0.6,
                end: () => `+=${track.scrollWidth - window.innerWidth}`,
                invalidateOnRefresh: true,
              },
            })
          : undefined;

        gsap.utils.toArray<HTMLElement>('.chapter').forEach((chapter) => {
          const trigger = wide
            ? { trigger: chapter, containerAnimation: scroll, start: 'left 75%' }
            : { trigger: chapter, start: 'top 75%' };

          const tl = gsap
            .timeline({ scrollTrigger: trigger })
            .from(chapter.querySelector('.chapter-doodle'), { scale: 0.4, rotation: -20, opacity: 0, ease: 'back.out(2)', duration: 0.7 })
            .from(chapter.querySelectorAll('.chapter-title, p'), { y: 24, opacity: 0, stagger: 0.12 }, '<0.15');

          const notes = chapter.querySelectorAll('.note');
          if (notes.length) {
            tl.from(notes, { clipPath: 'inset(0 100% 0 0)', stagger: 0.35, duration: 0.6, ease: 'none' }, '<0.3')
              .from(chapter.querySelectorAll('.crossed'), { '--strike': 0, duration: 0.4 });
          }
        });
      }),
    );
  }
}
