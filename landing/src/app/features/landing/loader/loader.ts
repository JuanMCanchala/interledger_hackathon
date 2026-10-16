import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { MOTION, animate, gsap } from '../../../core/motion';
import { Logo } from '../../../shared/brand/logo';

const FONT_TIMEOUT_MS = 1500;

/**
 * Plays the «MiPlante → Pa' lante» wordplay once and flies the logo into the
 * element marked with [data-loader-target].
 */
@Component({
  selector: 'app-loader',
  imports: [Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!finished()) {
      <div class="loader" role="status">
        <span class="sr-only">Cargando MiPlante</span>
        <app-logo class="loader-logo" aria-hidden="true" [wordplay]="true" />
      </div>
    }
  `,
  styleUrl: './loader.scss',
})
export class Loader {
  readonly reveal = output<void>();
  protected readonly finished = signal(false);

  constructor() {
    animate((mm, root) => {
      let animated = false;
      mm.add(MOTION, () => {
        animated = true;
        this.play(root);
      });
      if (!animated) {
        this.finished.set(true);
        this.reveal.emit();
      }
    });
  }

  private async play(root: HTMLElement): Promise<void> {
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    document.documentElement.classList.add('is-loading');

    const target = document.querySelector<HTMLElement>('[data-loader-target]')!;
    const logo = root.querySelector<HTMLElement>('.loader-logo')!;
    const q = gsap.utils.selector(logo);
    gsap.set(target, { autoAlpha: 0 });
    gsap.set(logo, { autoAlpha: 0 });

    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, FONT_TIMEOUT_MS))]);

    const flight = () => {
      const from = logo.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      return { x: to.left - from.left, y: to.top - from.top, scale: to.width / from.width };
    };

    gsap
      .timeline({ defaults: { ease: 'power3.out' }, onComplete: () => this.finish(target) })
      .set(logo, { autoAlpha: 1 })
      .from(q('.mi, .p, .lante'), { yPercent: 50, opacity: 0, stagger: 0.12, duration: 0.7 })
      .to(q('.mi'), { y: -60, rotation: -8, opacity: 0, transformOrigin: '50% 100%', ease: 'power2.in', duration: 0.45 }, '+=0.35')
      .to(q('.p'), { x: -228, duration: 0.7, ease: 'back.inOut(1.4)' }, '<0.25')
      .to(q('.lante'), { x: -30, duration: 0.7, ease: 'back.inOut(1.4)' }, '<')
      .fromTo(q('.pa'), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: 'back.out(2)' }, '<0.25')
      .add(() => this.reveal.emit(), '+=0.35')
      .to(logo, {
        x: () => flight().x,
        y: () => flight().y,
        scale: () => flight().scale,
        transformOrigin: '0 0',
        duration: 0.9,
        ease: 'expo.inOut',
      }, '<')
      .to(root.querySelector('.loader'), { backgroundColor: 'rgb(9 70 65 / 0)', duration: 0.6, ease: 'none' }, '<0.25');
  }

  private finish(target: HTMLElement): void {
    gsap.set(target, { autoAlpha: 1 });
    document.documentElement.classList.remove('is-loading');
    this.finished.set(true);
  }
}
