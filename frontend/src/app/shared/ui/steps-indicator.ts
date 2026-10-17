import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-steps-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="steps" [attr.aria-label]="ariaLabel()">
      @for (step of items(); track $index) {
        <li
          class="step"
          [class.is-done]="step.done"
          [class.is-current]="step.current"
        >
          <span class="step-icon" aria-hidden="true">{{ step.done ? '✓' : '' }}</span>
          <span>{{ step.label }}</span>
          <span class="sr-only">
            {{ step.done ? ' (listo)' : step.current ? ' (en curso)' : '' }}
          </span>
        </li>
      }
    </ol>
  `,
})
export class StepsIndicator {
  readonly labels = input.required<readonly string[]>();
  readonly doneFlags = input.required<readonly boolean[]>();
  readonly active = input<boolean>(true);
  readonly ariaLabel = input<string>('Pasos');

  protected readonly items = computed(() => {
    const labels = this.labels();
    const flags = this.doneFlags();
    const active = this.active();
    let currentMarked = false;
    return labels.map((label, index) => {
      const done = Boolean(flags[index]);
      const current = active && !done && !currentMarked;
      if (current) currentMarked = true;
      return { label, done, current };
    });
  });
}
