import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="goal-ring">
      <svg
        viewBox="0 0 100 100"
        [attr.class]="'ring is-' + tone()"
        role="img"
        [attr.aria-label]="label()"
      >
        <circle cx="50" cy="50" [attr.r]="radius" class="ring-track" />
        <circle
          cx="50"
          cy="50"
          [attr.r]="radius"
          class="ring-fill"
          [attr.stroke-dasharray]="dashArray()"
          transform="rotate(-90 50 50)"
        />
        <text
          x="50"
          y="50"
          class="ring-text"
          text-anchor="middle"
          dominant-baseline="central"
        >
          {{ percentText() }}
        </text>
      </svg>
    </div>
  `,
})
export class ProgressRing {
  readonly ratio = input.required<number>();
  readonly tone = input<'brand' | 'gold' | 'info'>('brand');
  readonly label = input.required<string>();

  protected readonly radius = 42;
  private readonly length = 2 * Math.PI * this.radius;

  private readonly clamped = computed(() => {
    const r = this.ratio();
    return Math.max(0, Math.min(1, Number.isFinite(r) ? r : 0));
  });

  protected readonly dashArray = computed(
    () => `${this.length * this.clamped()} ${this.length}`,
  );

  protected readonly percentText = computed(
    () => `${Math.round(this.clamped() * 100)}%`,
  );
}
