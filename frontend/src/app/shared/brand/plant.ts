import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PlantStage = 'seed' | 'sprout' | 'bloom';

@Component({
  selector: 'app-plant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[attr.data-stage]': 'stage()' },
  template: `
    <svg viewBox="0 0 200 250">
      <g class="sparks">
        <path d="M100 8 v12 M64 24 l8 9 M136 24 l-8 9 M50 62 h12 M150 62 h-12" />
      </g>
      <path class="stem" d="M100 186 C 97 164, 104 140, 99 118 C 96 104, 100 96, 100 90" />
      <path class="leaf leaf-left" d="M99 164 C 84 148, 64 150, 54 164 C 68 176, 88 176, 99 164 Z" />
      <path class="leaf leaf-right" d="M101 138 C 116 120, 138 122, 148 136 C 134 150, 114 150, 101 138 Z" />
      <g class="flower">
        @for (angle of petals; track angle) {
          <ellipse cx="100" cy="42" rx="11" ry="15" [attr.transform]="'rotate(' + angle + ' 100 70)'" />
        }
        <circle class="bloom-center" cx="100" cy="70" r="17" />
        <path class="bloom-sign" d="M106 61 c-3 -3 -12 -3 -12 3 c0 6 12 3 12 9 c0 6 -9 6 -12 3 M100 57 v26" />
      </g>
      <ellipse class="seed" cx="100" cy="184" rx="9" ry="6" />
      <path class="pot" d="M44 184 h112 v14 h-112 z M54 198 l8 42 h76 l8 -42" />
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
    path, ellipse, circle {
      fill: none; stroke: var(--plant-ink, var(--lima)); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round;
    }
    .seed, .bloom-center { fill: var(--plant-ink, var(--lima)); }
    .bloom-sign { stroke: var(--plant-ground, var(--monte)); stroke-width: 4; }
    .leaf, .flower ellipse { fill: var(--plant-ground, var(--monte)); }
    :host([data-stage='seed']) :is(.stem, .leaf, .flower, .sparks),
    :host([data-stage='sprout']) :is(.seed, .flower, .sparks),
    :host([data-stage='bloom']) .seed { display: none; }
  `,
})
export class Plant {
  /** A fixed growth stage; without it every part is drawn, for an animation to drive. */
  readonly stage = input<PlantStage | null>(null);
  protected readonly petals = [0, 60, 120, 180, 240, 300];
}
