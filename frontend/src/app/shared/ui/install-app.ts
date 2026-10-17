import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PwaInstallService } from '../../core/pwa-install.service';

@Component({
  selector: 'app-install-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.has-install-action]': 'visible()' },
  template: `
    @if (!pwa.standalone()) {
      @if (pwa.canInstall() || pwa.installing()) {
        <button
          type="button"
          class="btn btn-lima btn-sm"
          [disabled]="pwa.installing()"
          [attr.aria-busy]="pwa.installing() ? 'true' : null"
          (click)="install()"
        >
          {{ pwa.installing() ? 'Instalando…' : 'Instalar MiPlante' }}
        </button>
      } @else if (pwa.iosManualInstall()) {
        <details>
          <summary class="btn btn-lima btn-sm">Instalar MiPlante</summary>
          <p class="install-note small">
            En Safari, toca <strong>Compartir</strong> y luego
            <strong>Añadir a pantalla de inicio</strong>. Si estás en otro navegador, abre esta
            página en Safari.
          </p>
        </details>
      }

      @if (error()) {
        <p class="install-note small" role="status">{{ error() }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: none;
    }

    :host(.has-install-action) {
      display: inline-block;
      position: relative;
      flex-shrink: 0;
    }

    summary {
      list-style: none;
      cursor: pointer;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    .install-note {
      width: min(18rem, 75vw);
      margin: 8px 0 0;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow);
      font-weight: 400;
      line-height: 1.5;
    }
  `,
})
export class InstallApp {
  protected readonly pwa = inject(PwaInstallService);
  protected readonly error = signal('');
  protected readonly visible = computed(
    () =>
      !this.pwa.standalone() &&
      (this.pwa.canInstall() ||
        this.pwa.installing() ||
        this.pwa.iosManualInstall() ||
        !!this.error()),
  );

  protected async install(): Promise<void> {
    this.error.set('');
    if ((await this.pwa.install()) === 'failed') {
      this.error.set(
        'No pudimos abrir la instalación. Intenta desde el menú de tu navegador. Puedes seguir usando MiPlante aquí.',
      );
    }
  }
}
