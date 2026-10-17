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
            [attr.class]="bar.cls"
          >
            <title>{{ bar.title }}</title>
          </rect>
          @if (bar.showLabel) {
            <text
              [attr.x]="bar.labelX"
              [attr.y]="height + 13"
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

  protected readonly height = 96;
  private readonly top = 10;
  private readonly slot = 20;

  protected readonly chartWidth = computed(() =>
    Math.max(this.bars().length * this.slot, this.slot * 10),
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
      const hasValue = bar.value > 0;
      const yVal = this.yFor(bar.value);
      const barHeight = hasValue ? Math.max(4, this.height - yVal) : 2.5;
      const day = index + 1;
      const showLabel = day === 1 || day % 3 === 0 || index === list.length - 1;
      const cls = bar.highlight
        ? 'chart-bar is-today'
        : hasValue
          ? 'chart-bar'
          : 'chart-bar is-empty';
      return {
        ...bar,
        cls,
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
