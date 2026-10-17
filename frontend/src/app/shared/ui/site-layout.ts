import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="site-header">
      <a class="brand" routerLink="/">
        <span class="brand-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 21v-9" />
            <path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7z" />
            <path d="M12 14c0-3-2.5-5.5-7-5.5 0 3 2.5 5.5 7 5.5z" />
          </svg>
        </span>
        MiPlante
      </a>
      @if (actionLabel() && actionLink()) {
        <a
          class="btn btn-ghost"
          [routerLink]="actionLink()"
          [queryParams]="actionQueryParams()"
        >
          {{ actionLabel() }}
        </a>
      }
    </header>
  `,
})
export class SiteHeader {
  readonly actionLabel = input<string>('');
  readonly actionLink = input<string>('');
  readonly actionQueryParams = input<Params | null>(null);
}

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="site-footer" [class.panel-footer]="panelFooter()">
      <span>Pagos con Open Payments sobre la red Interledger.</span>
      <a routerLink="/sandbox">Sandbox de Open Payments</a>
    </footer>
  `,
})
export class SiteFooter {
  readonly panelFooter = input<boolean>(false);
}
