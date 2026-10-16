import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MOTION, ScrollTrigger, animate, gsap } from '../../../../../core/motion';

interface Node {
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

const HUB = { x: 200, y: 150 };

@Component({
  selector: 'app-network-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Funciona con Open Payments</h3>
    <p>
      Open Payments es un estándar abierto, impulsado por la Interledger Foundation, que deja que
      billeteras y bancos distintos se hablen entre sí. Por eso tus clientes te pagan desde la
      billetera que tengan, y MiPlante reparte la plata sin que hagas cada transferencia a mano.
    </p>
    <svg class="map" viewBox="0 0 400 300" aria-hidden="true">
      @for (node of sources.concat(targets); track node.label) {
        <line [attr.x1]="node.x" [attr.y1]="node.y" [attr.x2]="hub.x" [attr.y2]="hub.y" />
      }
      @for (node of sources.concat(targets); track node.label) {
        <g class="node">
          <circle [attr.cx]="node.x" [attr.cy]="node.y" r="8" />
          <text [attr.x]="node.x" [attr.y]="node.y + 26">{{ node.label }}</text>
        </g>
      }
      <circle class="pulse in" r="6" [attr.cx]="sources[0].x" [attr.cy]="sources[0].y" />
      @for (node of targets; track node.label) {
        <circle class="pulse out" r="5" [attr.cx]="hub.x" [attr.cy]="hub.y" />
      }
      <g class="hub">
        <circle [attr.cx]="hub.x" [attr.cy]="hub.y" r="30" />
        <path d="M200 128 L207 143 L222 150 L207 157 L200 172 L193 157 L178 150 L193 143 Z" />
      </g>
    </svg>
    <button type="button" class="button magnetic" (click)="send()">Enviar un pago</button>
  `,
  styles: `
    :host { display: grid; gap: 1rem; align-content: start; height: 100%; }
    .map { width: 100%; height: auto; overflow: visible; }
    line { stroke: rgb(204 241 55 / 35%); stroke-width: 2; stroke-dasharray: 4 6; }
    .node circle { fill: var(--monte-hondo); stroke: var(--lima); stroke-width: 3; }
    text { fill: var(--papel); font: 500 13px var(--sans); text-anchor: middle; }
    .hub circle { fill: var(--lima); }
    .hub path { fill: var(--monte); }
    .pulse { fill: var(--lima); opacity: 0; }
    .button { justify-self: start; }
  `,
})
export class NetworkTile {
  protected readonly hub = HUB;
  protected readonly sources: readonly Node[] = [
    { label: 'Cliente del barrio', x: 55, y: 55 },
    { label: 'Turista', x: 55, y: 250 },
  ];
  protected readonly targets: readonly Node[] = [
    { label: 'Proveedor', x: 345, y: 45 },
    { label: 'Fondo Anti‑Gota', x: 350, y: 155 },
    { label: 'Ahorro', x: 335, y: 265 },
  ];
  private flow?: gsap.core.Timeline;

  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        this.flow = gsap
          .timeline({ repeat: -1, repeatDelay: 1.2, paused: true })
          .fromTo('.pulse.in', { attr: { cx: this.sources[0].x, cy: this.sources[0].y }, opacity: 1 }, { attr: { cx: HUB.x, cy: HUB.y }, duration: 0.8, ease: 'power1.in' })
          .to('.pulse.in', { opacity: 0, duration: 0.1 })
          .fromTo('.hub', { scale: 1 }, { scale: 1.15, svgOrigin: `${HUB.x} ${HUB.y}`, yoyo: true, repeat: 1, duration: 0.15 }, '<');
        gsap.utils.toArray<SVGCircleElement>('.pulse.out').forEach((pulse, i) =>
          this.flow!.fromTo(
            pulse,
            { attr: { cx: HUB.x, cy: HUB.y }, opacity: 1 },
            { attr: { cx: this.targets[i].x, cy: this.targets[i].y }, duration: 0.8, ease: 'power1.out' },
            '<0.05',
          ).to(pulse, { opacity: 0, duration: 0.15 }, '>-0.05'),
        );
        ScrollTrigger.create({
          trigger: '.map',
          start: 'top 85%',
          end: 'bottom 15%',
          onToggle: ({ isActive }) => this.flow?.paused(!isActive),
        });
        return () => (this.flow = undefined);
      }),
    );
  }

  protected send(): void {
    this.flow?.restart();
  }
}
