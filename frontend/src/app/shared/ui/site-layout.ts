import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { Logo } from '../brand/logo';
import { InstallApp } from './install-app';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, Logo, InstallApp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="site-header">
      <div class="row">
        <a class="brand" routerLink="/" aria-label="MiPlante">
          <span class="brand-logo">
            <app-logo />
          </span>
        </a>
        @if (badge()) {
          <span class="header-pill">{{ badge() }}</span>
        }
      </div>

      @if ((actionLabel() && actionLink()) || showInstall()) {
        <nav class="site-nav header-nav" aria-label="Navegación rápida">
          @if (showInstall()) {
            <app-install-app />
          }
          @if (actionLabel() && actionLink()) {
            <a
              class="btn btn-lima btn-sm"
              [routerLink]="actionLink()!"
              [queryParams]="actionQueryParams()"
            >
              {{ actionLabel() }}
            </a>
          }
        </nav>
      }
    </header>
  `,
})
export class SiteHeader {
  readonly showInstall = input<boolean>(false);
  readonly badge = input<string>('');
  readonly actionLabel = input<string>('');
  readonly actionLink = input<string>('');
  readonly actionQueryParams = input<Params | null>(null);
  readonly hideSandbox = input<boolean>(false);
}

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="site-footer" [class.panel-footer]="panelFooter()">
      <div class="site-footer-brand">
        <a routerLink="/" aria-label="MiPlante" class="footer-logo">
          <app-logo />
        </a>
        <p>
          <strong>MiPlante</strong> — Separa el plante de la ganancia en cada
          venta sobre la red Open Payments.
        </p>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  readonly panelFooter = input<boolean>(false);
}
