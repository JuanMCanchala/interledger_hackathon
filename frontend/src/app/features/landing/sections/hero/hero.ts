import { APP_LINKS } from '../../../../core/app-links';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FINE_POINTER,
  MOTION,
  ScrollTrigger,
  SplitText,
  animate,
  gsap,
} from '../../../../core/motion';
import { formatCop } from '../../../../core/money';
import { Doodle, DoodleName } from '../../../../shared/brand/doodle';
import { Logo } from '../../../../shared/brand/logo';
import { POCKETS, splitSale } from '../../domain/pockets';

interface Floater {
  readonly name: DoodleName;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly depth: number;
  readonly speed: number;
}

const TILT_DEGREES = 8;
const PARALLAX_PX = 36;

@Component({
  selector: 'app-hero',
  imports: [Logo, Doodle, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  protected readonly app = APP_LINKS;

  readonly revealed = input(false);

  protected readonly pockets = POCKETS;
  protected readonly amounts = [5000, 20000, 50000];
  protected readonly phrases = [
    'Si hoy no vendes, hoy no pagas',
    'Cada venta se reparte solita',
    'También registras tus ventas en efectivo',
    'Tu historial crece contigo',
  ];
  protected readonly floaters: readonly Floater[] = [
    { name: 'peso', x: 4, y: 16, size: 70, depth: 1.4, speed: 0.8 },
    { name: 'monedas', x: 52, y: 66, size: 80, depth: 0.8, speed: 0.9 },
    { name: 'alcancia', x: 60, y: 7, size: 96, depth: 1.1, speed: 0.75 },
    { name: 'planta', x: 2, y: 72, size: 90, depth: 0.9, speed: 1.15 },
    { name: 'billetera', x: 38, y: 76, size: 74, depth: 1.6, speed: 1.2 },
    { name: 'crecimiento', x: 95, y: 74, size: 84, depth: 1.2, speed: 1.1 },
    { name: 'calculadora', x: 96, y: 42, size: 78, depth: 1.3, speed: 0.95 },
  ];
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
  private intro?: () => void;

  constructor() {
    animate((mm, root) => {
      this.root = root;

      mm.add(MOTION, () => {
        this.reducedMotion = false;
        this.ticker();
        this.idleFloat();
        const words = SplitText.create('.sentence', { type: 'words', mask: 'words' }).words;
        gsap.set([words, '.aside > *', '.till', '.floater-doodle'], { autoAlpha: 0 });
        this.intro = () => this.playIntro(words);
        if (this.revealed()) this.intro();
        return () => (this.reducedMotion = true);
      });

      mm.add(FINE_POINTER, () => this.followPointer());

      if (this.reducedMotion) this.splitTimeline(this.sale()).progress(1);
    });

    effect(() => {
      if (this.revealed()) this.intro?.();
    });
  }

  protected sell(amount: number): void {
    this.sale.set(amount);
    const tl = this.splitTimeline(amount);
    if (this.reducedMotion) tl.progress(1);
  }

  private playIntro(words: Element[]): void {
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .fromTo(words, { yPercent: 110, autoAlpha: 1 }, { yPercent: 0, stagger: 0.06, duration: 0.6 })
      .fromTo('.aside > *', { y: 20 }, { y: 0, autoAlpha: 1, stagger: 0.1, duration: 0.6 }, '<0.2')
      .fromTo(
        '.till',
        { y: 80, rotationX: 25 },
        { y: 0, rotationX: 0, autoAlpha: 1, duration: 1 },
        '<',
      )
      .fromTo(
        '.floater-doodle',
        { scale: 0 },
        { scale: 1, autoAlpha: 1, stagger: 0.07, ease: 'back.out(2.5)', duration: 0.6 },
        '<0.2',
      )
      .add(() =>
        ScrollTrigger.create({
          trigger: '.till',
          start: 'center 80%',
          once: true,
          onEnter: () => this.splitTimeline(this.sale()),
        }),
      );
  }

  private ticker(): void {
    const loop = gsap.to('.ticker-track', {
      xPercent: -50,
      ease: 'none',
      duration: 28,
      repeat: -1,
    });
    ScrollTrigger.create({
      onUpdate: (self) => {
        const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 400, 4);
        gsap.to(loop, { timeScale: boost, duration: 0.2, overwrite: true });
        gsap.to(loop, { timeScale: 1, duration: 1, delay: 0.25 });
      },
    });
  }

  private idleFloat(): void {
    gsap.utils.toArray<HTMLElement>('.floater-doodle').forEach((el) =>
      gsap.to(el, {
        yPercent: gsap.utils.random(-12, 12),
        rotation: gsap.utils.random(-10, 10),
        duration: gsap.utils.random(2.4, 4.2),
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      }),
    );
  }

  private followPointer(): () => void {
    const tilt = {
      x: gsap.quickTo('.till', 'rotationX', { duration: 0.6 }),
      y: gsap.quickTo('.till', 'rotationY', { duration: 0.6 }),
    };
    const floaters = gsap.utils.toArray<HTMLElement>('.floater-doodle').map((el) => ({
      depth: Number(el.dataset['depth']),
      x: gsap.quickTo(el, 'x', { duration: 1 }),
      y: gsap.quickTo(el, 'y', { duration: 1 }),
    }));

    const move = (e: PointerEvent) => {
      const dx = e.clientX / innerWidth - 0.5;
      const dy = e.clientY / innerHeight - 0.5;
      tilt.y(dx * TILT_DEGREES);
      tilt.x(-dy * TILT_DEGREES);
      floaters.forEach((f) => {
        f.x(dx * PARALLAX_PX * f.depth);
        f.y(dy * PARALLAX_PX * f.depth);
      });
    };
    this.root.addEventListener('pointermove', move);
    return () => this.root.removeEventListener('pointermove', move);
  }

  private splitTimeline(amount: number): gsap.core.Timeline {
    const q = gsap.utils.selector(this.root);
    const shares = splitSale(amount);
    this.running?.progress(1).kill();
    const ticket = q('.ticket')[0].getBoundingClientRect();
    const tl = (this.running = gsap.timeline());

    tl.fromTo(
      q('.ticket'),
      { scale: 0.92 },
      { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)' },
    );
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
        .fromTo(
          pocket.querySelector('.jar-doodle'),
          { y: 0 },
          { y: -8, duration: 0.15, yoyo: true, repeat: 1 },
          '<',
        )
        .to(
          counter,
          {
            value: shares[i],
            duration: 0.6,
            ease: 'power1.out',
            onUpdate: () => (amountEl.textContent = formatCop(Math.round(counter.value))),
          },
          '<',
        );
    });
    return tl;
  }
}
