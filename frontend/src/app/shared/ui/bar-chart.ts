import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarEntry {
  label: string;
  value: number;
  title: string;
  highlight?: boolean;
}

@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-box">
      <svg
        [attr.viewBox]="'0 0 ' + chartWidth() + ' ' + (height + 18)"
        class="chart"
        role="img"
        [attr.aria-label]="summary()"
      >
        <line x1="0" [attr.x2]="chartWidth()" [attr.y1]="height" [attr.y2]="height" class="chart-axis" />
        @for (bar of computedBars(); track $index) {
          <rect
            [attr.x]="bar.x"
            [attr.y]="bar.y"
            [attr.width]="bar.width"
            [attr.height]="bar.height"
            rx="3"
            [attr.class]="bar.highlight ? 'chart-bar is-today' : 'chart-bar'"
          >
            <title>{{ bar.title }}</title>
          </rect>
          @if (bar.showLabel) {
            <text
              [attr.x]="bar.labelX"
              [attr.y]="height + 14"
              class="chart-label"
              text-anchor="middle"
            >
              {{ bar.label }}
            </text>
          }
        }
        @if (goalY() !== null) {
          <line
            x1="0"
            [attr.x2]="chartWidth()"
            [attr.y1]="goalY()"
            [attr.y2]="goalY()"
            class="chart-goal"
          >
            <title>{{ goalLabel() || 'Meta' }}</title>
          </line>
        }
      </svg>
    </div>
  `,
})
export class BarChart {
  readonly bars = input.required<BarEntry[]>();
  readonly goal = input<number | undefined>(undefined);
  readonly goalLabel = input<string>('');
  readonly summary = input<string>('');

  protected readonly height = 140;
  private readonly top = 12;
  private readonly slot = 16;

  protected readonly chartWidth = computed(() =>
    Math.max(this.bars().length * this.slot, this.slot * 7),
  );

  private readonly maxVal = computed(() =>
    Math.max(1, this.goal() ?? 0, ...this.bars().map((b) => b.value)),
  );

  private yFor(value: number): number {
    return this.top + (this.height - this.top) * (1 - value / this.maxVal());
  }

  protected readonly computedBars = computed(() => {
    const list = this.bars();
    return list.map((bar, index) => {
      const yVal = this.yFor(bar.value);
      const barHeight = Math.max(bar.value > 0 ? 2 : 0, this.height - yVal);
      const day = index + 1;
      const showLabel = day === 1 || day % 5 === 0 || index === list.length - 1;
      return {
        ...bar,
        x: index * this.slot + 3,
        y: this.height - barHeight,
        width: this.slot - 6,
        height: barHeight,
        showLabel,
        labelX: index * this.slot + this.slot / 2,
      };
    });
  });

  protected readonly goalY = computed(() => {
    const g = this.goal();
    return g && g > 0 ? this.yFor(g) : null;
  });
}
