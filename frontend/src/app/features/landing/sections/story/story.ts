import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MOTION, animate, gsap } from '../../../../core/motion';
import { formatCop } from '../../../../core/money';
import { Logo } from '../../../../shared/brand/logo';
import { POCKETS, splitSale } from '../../domain/pockets';

const SALE = 20000;

@Component({
  selector: 'app-story',
  imports: [Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './story.html',
  styleUrl: './story.scss',
})
export class Story {
  protected readonly chapters = [
    {
      title: 'Esta es Doña Nelly',
      text: 'Hace más de 15 años atiende su tiendita de barrio, de sol a sol. Es una mujer echada pa’ lante, pero sus ventas nunca son iguales: hay días muy buenos y días malos.',
    },
    {
      title: 'Todo lo anota en un cuaderno viejo',
      text: 'Apenas terminó el bachillerato y las aplicaciones la confunden. Sus hijos casi nunca tienen tiempo de explicarle. El cuaderno es su única aliada, y ya no le cabe una cuenta más.',
    },
    {
      title: 'Y a fin de mes, no alcanza',
      text: 'Le debe plata a varios proveedores y conocidos. Cuando llega el pedido y la caja está vacía, el «gota a gota» parece la única salida.',
    },
    {
      title: 'Con MiPlante, las cuentas se hacen solas',
      text: 'Cada venta se reparte en sus bolsillos apenas le pagan. Si un día no vende, ese día no paga. Y lo ve todo clarito en su celular.',
    },
  ];
  protected readonly week = [
    { name: 'Lunes', sold: 85000 },
    { name: 'Martes (llovió)', sold: 12000 },
    { name: 'Miércoles', sold: 140000 },
    { name: 'Jueves', sold: 30000 },
    { name: 'Viernes', sold: 0 },
  ];
  protected readonly pockets = POCKETS;
  protected readonly sale = SALE;
  protected readonly shares = splitSale(SALE);
  protected readonly format = formatCop;
  protected readonly animated = signal(false);

  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        this.animated.set(true);
        const write = { clipPath: 'inset(0 100% 0 0)', stagger: 0.12, duration: 0.3, ease: 'none' };
        const chapters = gsap.utils.toArray<HTMLElement>('.chapter');
        const steps = gsap.utils.toArray<HTMLElement>('.step');
        gsap.set(chapters.slice(1), { autoAlpha: 0, y: 30 });
        gsap.set('.scene-debts, .scene-pockets', { autoAlpha: 0 });

        // Snapping fights a finger on touch screens, so only a mouse or trackpad gets it.
        const snap = matchMedia('(pointer: fine)').matches
          ? ({ snapTo: 'labelsDirectional', duration: { min: 0.3, max: 0.8 }, delay: 0.1 } as const)
          : undefined;
        const tl = gsap.timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: {
            trigger: '.story',
            start: 'top top',
            end: () => `+=${innerHeight * 4}`,
            pin: true,
            anticipatePin: 1,
            scrub: snap ? 0.6 : true,
            snap,
          },
        });

        const chapter = (i: number, at: number | string) =>
          tl
            .to(chapters[i - 1], { autoAlpha: 0, y: -30, duration: 0.25 }, at)
            .to(chapters[i], { autoAlpha: 1, y: 0, duration: 0.3 }, '>-0.05')
            .to(steps[i], { '--done': 1, duration: 0.3 }, '<');

        tl.to(steps[0], { '--done': 1, duration: 0.2 })
          .from('.scene-sales .note', write, 0)
          .from('.chart path', { drawSVG: 0, duration: 0.5, ease: 'none' }, '<0.3')
          .from('.scene-sales .sticky', { scale: 1.6, rotation: 20, autoAlpha: 0, duration: 0.25, ease: 'back.out(2)' })
          .addLabel('sales');

        chapter(1, '+=0.3');
        tl.to('.scene-sales', { autoAlpha: 0, y: -20, duration: 0.25 }, '<')
          .set('.scene-debts', { autoAlpha: 1 })
          .from('.scene-debts .note', write)
          .from('.mess path', { drawSVG: 0, duration: 0.45, ease: 'none' })
          .from('.scene-debts .sticky', { scale: 1.6, rotation: -20, autoAlpha: 0, duration: 0.25, ease: 'back.out(2)' })
          .addLabel('debts');

        chapter(2, '+=0.3');
        tl.from('.drop', { yPercent: -400, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, '<')
          .to('.drop', { scaleY: 0.4, scaleX: 1.6, transformOrigin: '50% 100%', duration: 0.08 })
          .set('.drop', { autoAlpha: 0 })
          .fromTo('.ink', { clipPath: 'circle(0% at 50% 14%)' }, { clipPath: 'circle(150% at 50% 14%)', duration: 0.6, ease: 'power2.in' })
          .from('.ink-line', { y: 20, autoAlpha: 0, stagger: 0.12, duration: 0.25 })
          .addLabel('ink');

        chapter(3, '+=0.3');
        tl.set('.scene-debts', { autoAlpha: 0 }, '<')
          .set('.scene-pockets', { autoAlpha: 1 }, '<')
          .to('.ink', { clipPath: 'circle(0% at 50% 100%)', duration: 0.5, ease: 'power2.inOut' }, '<')
          .from('.scene-pockets .note', write)
          .from('.check', { scale: 0, stagger: 0.08, duration: 0.15, ease: 'back.out(3)' }, '<0.2')
          .from('.stamp', { scale: 2.2, rotation: -40, autoAlpha: 0, duration: 0.3, ease: 'back.out(1.6)' })
          .addLabel('pockets');

        return () => this.animated.set(false);
      }),
    );
  }
}
