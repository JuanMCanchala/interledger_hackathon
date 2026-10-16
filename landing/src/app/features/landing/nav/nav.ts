import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { animate, gsap, ScrollTrigger } from '../../../core/motion';
import { Logo } from '../../../shared/brand/logo';

const SHOW_NAV_UNTIL_PX = 120;

@Component({
  selector: 'app-nav',
  imports: [Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'menuOpen.set(false)' },
  templateUrl: './nav.html',
  styleUrl: './nav.scss',
})
export class Nav {
  protected readonly links = [
    { href: '#proposito', label: 'Por qué MiPlante', hint: 'El problema que resolvemos' },
    { href: '#historia', label: 'Para quién es', hint: 'La historia de Doña Nelly' },
    { href: '#funciones', label: 'Funciones', hint: 'Lo que hace por tu negocio' },
    { href: '#app', label: 'Así se ve la app', hint: 'Tu planta y tus bolsillos' },
  ];
  protected readonly active = signal<string | null>(null);
  protected readonly menuOpen = signal(false);

  constructor() {
    animate((mm, root) =>
      mm.add('all', () => {
        const bar = root.querySelector('.nav')!;

        gsap.to('.progress', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: true },
        });

        const sections = this.links.map(({ href }) => document.querySelector(href)!);
        ScrollTrigger.create({
          start: 0,
          end: 'max',
          onUpdate: ({ direction, scroll }) => {
            const hide = direction === 1 && scroll() > SHOW_NAV_UNTIL_PX && !this.menuOpen();
            bar.classList.toggle('hidden', hide);
            bar.classList.toggle('scrolled', scroll() > SHOW_NAV_UNTIL_PX);
            this.active.set(this.currentSection(sections));
          },
        });
      }),
    );
  }

  private currentSection(sections: Element[]): string | null {
    const middle = innerHeight / 2;
    const index = sections.findIndex((section) => {
      const { top, bottom } = section.getBoundingClientRect();
      return top <= middle && bottom > middle;
    });
    return index >= 0 ? this.links[index].href : null;
  }
}
