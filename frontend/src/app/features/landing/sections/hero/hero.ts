import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MOTION, ScrollTrigger, SplitText, animate, gsap } from '../../../../core/motion';
import { formatCop } from '../../../../core/money';
import { Doodle } from '../../../../shared/brand/doodle';
import { Logo } from '../../../../shared/brand/logo';
import { POCKETS, splitSale } from '../../domain/pockets';

@Component({
  selector: 'app-hero',
  imports: [Logo, Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  protected readonly pockets = POCKETS;
  protected readonly amounts = [5000, 20000, 50000];
  protected readonly sale = signal(20000);
  protected readonly format = formatCop;
  protected readonly summary = computed(() => {
    const shares = splitSale(this.sale());
    const parts = POCKETS.map((p, i) => `${formatCop(shares[i])} a ${p.name}`);
    return `Venta de ${formatCop(this.sale())}: ${parts.join(', ')}.`;
  });

  private root!: HTMLElement;
  private reducedMotion = true;
  private running?: gsap.core.Timeline;

  constructor() {
    animate((mm, root) => {
      this.root = root;
      mm.add(MOTION, () => {
        this.reducedMotion = false;
        this.intro().add(() =>
          ScrollTrigger.create({
            trigger: '.till',
            start: 'center 80%',
            once: true,
            onEnter: () => this.splitTimeline(this.sale()),
          }),
        );
        return () => (this.reducedMotion = true);
      });
      if (this.reducedMotion) {
        this.showWordplay();
        this.splitTimeline(this.sale()).progress(1);
      }
    });
  }

  protected sell(amount: number): void {
    this.sale.set(amount);
    const tl = this.splitTimeline(amount);
    if (this.reducedMotion) tl.progress(1);
  }

  private intro(): gsap.core.Timeline {
    const words = SplitText.create('.sentence', { type: 'words', mask: 'words' }).words;
    return gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .from('.word .mi, .word .p, .word .lante', { yPercent: 40, opacity: 0, stagger: 0.12, duration: 0.8 })
      .from(words, { yPercent: 110, stagger: 0.07, duration: 0.6 }, '-=0.3')
      .from('.lead, .copy .button', { y: 16, opacity: 0, stagger: 0.1, duration: 0.6 }, '<0.2')
      .from('.till', { y: 40, opacity: 0, duration: 0.8 }, '<')
      .add(this.wordplay(), '+=0.4');
  }

  private wordplay(): gsap.core.Timeline {
    return gsap
      .timeline({ defaults: { duration: 0.7, ease: 'back.inOut(1.4)' } })
      .to('.word .mi', { y: -60, rotation: -8, opacity: 0, transformOrigin: '50% 100%', ease: 'power2.in', duration: 0.45 })
      .to('.word .p', { x: -228 }, '<0.25')
      .to('.word .lante', { x: -30 }, '<')
      .fromTo('.word .pa', { opacity: 0, y: 40 }, { opacity: 1, y: 0, ease: 'back.out(2)' }, '<0.25');
  }

  private showWordplay(): void {
    gsap.set('.word .mi', { opacity: 0 });
    gsap.set('.word .p', { x: -228 });
    gsap.set('.word .lante', { x: -30 });
    gsap.set('.word .pa', { opacity: 1 });
  }

  private splitTimeline(amount: number): gsap.core.Timeline {
    const q = gsap.utils.selector(this.root);
    const shares = splitSale(amount);
    const ticket = q('.ticket')[0].getBoundingClientRect();
    this.running?.progress(1).kill();
    const tl = (this.running = gsap.timeline());

    tl.fromTo(q('.ticket'), { scale: 0.92 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    tl.set(q('.fill'), { scaleY: 0 }, 0);

    q('.pocket').forEach((pocket, i) => {
      const coin = pocket.querySelector('.coin')!;
      const box = coin.getBoundingClientRect();
      const amountEl = pocket.querySelector('.amount')!;
      const counter = { value: 0 };
      const at = 0.35 + i * 0.12;

      tl.fromTo(
        coin,
        {
          x: ticket.left + ticket.width / 2 - (box.left + box.width / 2),
          y: ticket.top + ticket.height / 2 - (box.top + box.height / 2),
          scale: 1.4,
          opacity: 1,
        },
        { x: 0, y: 0, scale: 0.6, duration: 0.7, ease: 'power2.inOut' },
        at,
      )
        .to(coin, { opacity: 0, duration: 0.15 })
        .to(pocket.querySelector('.fill'), { scaleY: 1, duration: 0.6, ease: 'power2.out' }, '<')
        .fromTo(pocket.querySelector('.jar-doodle'), { y: 0 }, { y: -6, duration: 0.15, yoyo: true, repeat: 1 }, '<')
        .to(counter, {
          value: shares[i],
          duration: 0.6,
          ease: 'power1.out',
          onUpdate: () => (amountEl.textContent = formatCop(Math.round(counter.value))),
        }, '<');
    });
    return tl;
  }
}
