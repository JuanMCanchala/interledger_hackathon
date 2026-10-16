import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LOGO } from './logo.paths';

@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="56 96 836 170" role="img" aria-label="MiPlante">
      <g class="mi">
        <path [attr.d]="paths.m" />
        <path [attr.d]="paths.i" />
      </g>
      <g class="p">
        <path [attr.d]="paths.p" />
        <path [attr.d]="paths.pBowl" />
        <path class="cut" [attr.d]="paths.pStar" />
      </g>
      @if (wordplay()) {
        <g class="pa">
          <path class="pa-a" transform="translate(-288 0)" [attr.d]="paths.a" />
          <path class="pa-apostrophe" [attr.d]="paths.apostrophe" />
        </g>
      }
      <g class="lante">
        <path class="l" [attr.d]="paths.l" />
        <path [attr.d]="paths.a" />
        <path [attr.d]="paths.n" />
        <path [attr.d]="paths.t" />
        <path [attr.d]="paths.e" />
      </g>
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; overflow: visible; fill: var(--logo-ink, var(--papel)); }
    .mi, .l, .pa-apostrophe { fill: var(--lima); }
    .cut { fill: var(--logo-cut, var(--monte)); }
    .pa { opacity: 0; }
  `,
})
export class Logo {
  readonly wordplay = input(false);
  protected readonly paths = LOGO;
}
