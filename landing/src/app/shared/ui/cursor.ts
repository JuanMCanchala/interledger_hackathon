import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FINE_POINTER, animate, gsap } from '../../core/motion';

const INTERACTIVE = 'a, button, [role="switch"], [data-cursor]';
const MAGNET_PULL = 0.3;

/** Follower ring for fine pointers: grows on interactive elements and pulls `.magnetic` ones. */
@Component({
  selector: 'app-cursor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<span class="ring"><span class="label"></span></span><span class="dot"></span>`,
  styles: `
    :host { display: none; }
    :host(.on) { display: block; opacity: 0; transition: opacity .3s; }
    :host(.moved) { opacity: 1; }
    .ring, .dot {
      position: fixed; top: 0; left: 0; z-index: 1000;
      pointer-events: none; border-radius: 50%;
    }
    .ring {
      display: grid; place-items: center;
      width: 40px; height: 40px; margin: -20px 0 0 -20px;
      border: 2px solid var(--lima);
      transition: width .25s, height .25s, margin .25s, background-color .25s;
    }
    .dot { width: 6px; height: 6px; margin: -3px 0 0 -3px; background: var(--lima); }
    .label { font: 700 .7rem/1 var(--sans); color: var(--monte); opacity: 0; transition: opacity .2s; }
    :host(.hover) .ring { width: 64px; height: 64px; margin: -32px 0 0 -32px; background: rgb(204 241 55 / 18%); }
    :host(.labelled) .ring { width: 84px; height: 84px; margin: -42px 0 0 -42px; background: var(--lima); }
    :host(.labelled) .label { opacity: 1; }
  `,
})
export class Cursor {
  constructor() {
    animate((mm, host) =>
      mm.add(FINE_POINTER, () => {
        host.classList.add('on');
        const label = host.querySelector('.label')!;
        const ring = { x: gsap.quickTo('.ring', 'x', { duration: 0.35 }), y: gsap.quickTo('.ring', 'y', { duration: 0.35 }) };
        const dot = { x: gsap.quickTo('.dot', 'x', { duration: 0.08 }), y: gsap.quickTo('.dot', 'y', { duration: 0.08 }) };
        let magnet: HTMLElement | null = null;

        const move = (e: PointerEvent) => {
          host.classList.add('moved');
          ring.x(e.clientX);
          ring.y(e.clientY);
          dot.x(e.clientX);
          dot.y(e.clientY);
          if (!magnet) return;
          const box = magnet.getBoundingClientRect();
          gsap.to(magnet, {
            x: (e.clientX - box.left - box.width / 2) * MAGNET_PULL,
            y: (e.clientY - box.top - box.height / 2) * MAGNET_PULL,
            duration: 0.3,
          });
        };

        const over = (e: PointerEvent) => {
          const target = (e.target as Element).closest<HTMLElement>(INTERACTIVE);
          const text = target?.dataset['cursor'] ?? '';
          host.classList.toggle('hover', !!target);
          host.classList.toggle('labelled', !!text);
          label.textContent = text;
          const next = (e.target as Element).closest<HTMLElement>('.magnetic');
          if (magnet && magnet !== next) gsap.to(magnet, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
          magnet = next;
        };

        window.addEventListener('pointermove', move);
        document.addEventListener('pointerover', over);
        return () => {
          host.classList.remove('on', 'moved');
          window.removeEventListener('pointermove', move);
          document.removeEventListener('pointerover', over);
        };
      }),
    );
  }
}
