import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type DoodleName =
  | 'alcancia'
  | 'monedas'
  | 'peso'
  | 'pago'
  | 'planta'
  | 'duda'
  | 'ahorro'
  | 'crecimiento'
  | 'calculadora'
  | 'billetera';

@Component({
  selector: 'app-doodle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--doodle]': 'url()' },
  template: '',
  styles: `
    :host {
      display: inline-block;
      aspect-ratio: 1;
      background: currentColor;
      mask: var(--doodle) center / contain no-repeat;
    }
  `,
})
export class Doodle {
  readonly name = input.required<DoodleName>();
  protected readonly url = computed(() => `url(/doodles/${this.name()}.png)`);
}
