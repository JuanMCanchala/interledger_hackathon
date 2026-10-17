import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * One question per screen: progress, the projected step and its navigation.
 * Enter submits the step; each new step slides in and focuses its first field.
 */
@Component({
  selector: 'app-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="wizard-shell" novalidate (submit)="submit($event)">
      <div class="wizard-top">
        <button
          type="button"
          class="wizard-back"
          [class.is-hidden]="step() === 0"
          [attr.aria-hidden]="step() === 0"
          [tabindex]="step() === 0 ? -1 : 0"
          (click)="back.emit()"
        >
          <span aria-hidden="true">←</span> Atrás
        </button>
        <span class="wizard-count">Paso {{ step() + 1 }} de {{ total() }}</span>
      </div>
      <div
        class="wizard-progress"
        role="progressbar"
        aria-valuemin="1"
        [attr.aria-valuemax]="total()"
        [attr.aria-valuenow]="step() + 1"
        [attr.aria-label]="'Paso ' + (step() + 1) + ' de ' + total()"
      >
        <span [style.width.%]="((step() + 1) / total()) * 100"></span>
      </div>

      <div class="wizard-body" #body aria-live="polite">
        <ng-content />
      </div>

      <button
        type="submit"
        class="btn btn-lima btn-lg btn-block wizard-next"
        [disabled]="busy()"
        [attr.aria-busy]="busy() ? 'true' : null"
      >
        @if (busy()) {
          <span class="btn-spinner" aria-hidden="true"></span>
          {{ busyLabel() }}
        } @else {
          {{ nextLabel() }}
        }
      </button>
    </form>
  `,
  styles: `
    :host { display: block; }
    .wizard-shell { display: grid; gap: 1.25rem; }
    .wizard-top { display: flex; align-items: center; justify-content: space-between; min-height: 44px; }
    .wizard-back {
      display: inline-flex; align-items: center; gap: .4rem; min-height: 44px; padding: 0 .9rem 0 .5rem;
      border: 0; border-radius: 999px; background: none; color: inherit; font: 700 .95rem var(--sans);
      cursor: pointer; transition: background-color .2s;
    }
    .wizard-back:hover { background: rgb(9 70 65 / 8%); }
    .wizard-back.is-hidden { visibility: hidden; }
    .wizard-count { font-size: .9rem; opacity: .75; font-variant-numeric: tabular-nums; }
    .wizard-progress { height: 8px; border-radius: 8px; background: rgb(9 70 65 / 12%); overflow: hidden; }
    .wizard-progress span {
      display: block; height: 100%; border-radius: inherit; background: var(--monte);
      transition: width .45s cubic-bezier(.34, 1.56, .64, 1);
    }
    .wizard-body { display: grid; gap: 1.1rem; padding-block: .5rem; }
    .wizard-next { margin-top: .25rem; }
  `,
})
export class Wizard {
  readonly step = input.required<number>();
  readonly total = input.required<number>();
  readonly nextLabel = input('Continuar');
  readonly busy = input(false);
  readonly busyLabel = input('Un momento…');

  readonly next = output<void>();
  readonly back = output<void>();

  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private firstRender = true;

  constructor() {
    afterRenderEffect(() => {
      this.step();
      const body = this.body().nativeElement;
      body.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
      if (this.firstRender) {
        this.firstRender = false;
        return;
      }
      if (!matchMedia(REDUCED_MOTION).matches) {
        body.animate(
          [
            { opacity: 0, transform: 'translateX(28px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' },
        );
      }
    });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.next.emit();
  }
}
