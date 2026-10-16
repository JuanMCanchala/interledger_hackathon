import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-plant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 200 250">
      <g class="sparks">
        <path d="M100 18 v14 M62 34 l9 10 M138 34 l-9 10 M46 70 h13 M154 70 h-13" />
      </g>
      <g class="flower">
        @for (angle of petals; track angle) {
          <ellipse cx="100" cy="46" rx="13" ry="22" [attr.transform]="'rotate(' + angle + ' 100 72)'" />
        }
        <circle class="bloom-center" cx="100" cy="72" r="18" />
        <path class="bloom-sign" d="M106 63 c-3 -3 -12 -3 -12 3 c0 6 12 3 12 9 c0 6 -9 6 -12 3 M100 59 v26" />
      </g>
      <path class="leaf leaf-left" d="M99 150 C 84 134, 64 136, 54 150 C 68 162, 88 162, 99 150 Z" />
      <path class="leaf leaf-right" d="M101 122 C 116 104, 138 106, 148 120 C 134 134, 114 134, 101 122 Z" />
      <path class="stem" d="M100 186 C 97 160, 104 132, 99 106 C 96 94, 100 84, 100 74" />
      <ellipse class="seed" cx="100" cy="184" rx="9" ry="6" />
      <path class="pot" d="M44 184 h112 v14 h-112 z M54 198 l8 42 h76 l8 -42" />
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
    path, ellipse, circle { fill: none; stroke: var(--lima); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
    .seed, .bloom-center { fill: var(--lima); }
    .bloom-sign { stroke: var(--monte); stroke-width: 4; }
    .leaf, .flower ellipse { fill: var(--monte); }
  `,
})
export class Plant {
  protected readonly petals = [0, 60, 120, 180, 240, 300];
}
