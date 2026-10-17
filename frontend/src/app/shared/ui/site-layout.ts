import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Logo } from '../brand/logo';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="site-header">
      <div class="row">
        <a class="brand" routerLink="/" aria-label="MiPlante: volver al inicio">
          <app-logo class="brand-logo" />
        </a>
        @if (badge()) {
          <span class="brand-tag">{{ badge() }}</span>
        }
      </div>

      <nav class="header-nav" aria-label="Navegación rápida">
        <a class="header-pill" routerLink="/">Inicio</a>
        @if (api.token()) {
          <a class="header-pill" routerLink="/merchant">Mi caja</a>
        }
        <a class="header-pill" routerLink="/sandbox">Sandbox</a>
        @if (actionLabel() && actionLink()) {
          <a
            class="header-pill is-cta"
            [routerLink]="actionLink()"
            [queryParams]="actionQueryParams()"
          >
            {{ actionLabel() }}
          </a>
        }
      </nav>
    </header>
  `,
})
export class SiteHeader {
  protected readonly api = inject(ApiService);
  readonly badge = input<string>('');
  readonly actionLabel = input<string>('');
  readonly actionLink = input<string>('');
  readonly actionQueryParams = input<Params | null>(null);
}

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="site-footer" [class.panel-footer]="panelFooter()">
      <div class="row">
        <a routerLink="/" aria-label="MiPlante" style="width: 112px; display: block">
          <app-logo />
        </a>
        <span>Pagos automáticos con Open Payments sobre Interledger.</span>
      </div>
      <div class="footer-links">
        <a routerLink="/">Landing</a>
        <a routerLink="/merchant">Mi caja</a>
        <a routerLink="/onboard">Configurar tienda</a>
        <a routerLink="/sandbox">Sandbox Open Payments</a>
      </div>
    </footer>
  `,
})
export class SiteFooter {
  readonly panelFooter = input<boolean>(false);
}
