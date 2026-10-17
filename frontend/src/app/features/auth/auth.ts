import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { safeNext } from '../../core/miplante.utils';
import { Doodle } from '../../shared/brand/doodle';
import { SiteFooter, SiteHeader } from '../../shared/ui/site-layout';

@Component({
  selector: 'app-auth',
  imports: [FormsModule, RouterLink, SiteHeader, SiteFooter, Doodle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page' },
  template: `
    <div class="container">
      <app-site-header
        [showInstall]="true"
        [badge]="registering() ? 'Registro rápido' : 'Acceso tendero'"
        [actionLabel]="registering() ? 'Ya tengo cuenta' : 'Crear cuenta'"
        [actionLink]="registering() ? '/login' : '/register'"
        [actionQueryParams]="nextQueryParams()"
      />

      <main class="wide-stage">
        <section class="stack" aria-label="Beneficios de MiPlante">
          <div class="stack-sm">
            <p class="eyebrow">
              {{ registering() ? 'Empieza en 1 minuto' : 'Bienvenido de vuelta' }}
            </p>
            <h1>
              {{
                registering()
                  ? 'Separa el plante de la ganancia en cada venta.'
                  : 'Entra a tu caja y sigue vendiendo.'
              }}
            </h1>
            <p class="lead">
              {{
                registering()
                  ? 'Crea tu cuenta para configurar tu tienda, conectar tu billetera Open Payments y repartir automáticamente proveedores, créditos y ahorro.'
                  : 'Revisa cuánto llevas vendido hoy, genera códigos QR al instante y mira el avance de tus obligaciones del mes.'
              }}
            </p>
          </div>

          <ul class="feature-pills">
            <li class="feature-pill">
              <span class="doodle-badge" aria-hidden="true">
                <app-doodle name="pago" />
              </span>
              <div>
                <strong>Cobro con QR inmediato</strong>
                <span>Tu cliente escanea y aprueba en su billetera Open Payments.</span>
              </div>
            </li>
            <li class="feature-pill">
              <span class="doodle-badge" aria-hidden="true">
                <app-doodle name="alcancia" />
              </span>
              <div>
                <strong>Bolsillos automáticos</strong>
                <span>Cada venta aparta sola la cuota de proveedores, deudas y ahorro.</span>
              </div>
            </li>
            <li class="feature-pill">
              <span class="doodle-badge" aria-hidden="true">
                <app-doodle name="crecimiento" />
              </span>
              <div>
                <strong>Tu ganancia real siempre clara</strong>
                <span>Cuando completas una cuota del mes, todo el resto queda libre para ti.</span>
              </div>
            </li>
          </ul>
        </section>

        <form class="card stack" (ngSubmit)="submit()" (input)="error.set('')" novalidate>
          <div class="mode-tabs" role="tablist" aria-label="Modo de acceso">
            <a
              role="tab"
              routerLink="/login"
              [queryParams]="nextQueryParams()"
              [class.is-active]="!registering()"
              [attr.aria-selected]="!registering()"
            >
              Entrar a mi caja
            </a>
            <a
              role="tab"
              routerLink="/register"
              [queryParams]="nextQueryParams()"
              [class.is-active]="registering()"
              [attr.aria-selected]="registering()"
            >
              Crear cuenta
            </a>
          </div>

          <div class="stack-sm">
            <h2>{{ registering() ? 'Datos de tu cuenta' : 'Inicia sesión' }}</h2>
            <p class="muted small">
              {{
                registering()
                  ? 'En el siguiente paso conectas tu billetera y eliges tus porcentajes.'
                  : 'Usa el correo y contraseña con los que registraste tu negocio.'
              }}
            </p>
          </div>

          @if (registering()) {
            <label class="field">
              <span>Tu nombre o el de quien atiende</span>
              <input
                #nameInput
                name="name"
                [(ngModel)]="name"
                required
                maxlength="80"
                autocomplete="name"
                placeholder="Ej: María Pérez"
              />
            </label>
          }

          <label class="field">
            <span>Correo electrónico</span>
            <input
              #emailInput
              name="email"
              type="email"
              [(ngModel)]="email"
              required
              maxlength="200"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
              placeholder="tu@correo.com"
            />
          </label>

          <label class="field">
            <span>Contraseña</span>
            <div class="input-with-action">
              <input
                #passwordInput
                name="password"
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="password"
                required
                [attr.minlength]="registering() ? 8 : null"
                maxlength="200"
                [attr.autocomplete]="registering() ? 'new-password' : 'current-password'"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="input-action"
                (click)="showPassword.set(!showPassword())"
              >
                {{ showPassword() ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
            @if (registering()) {
              <small class="hint">Usa al menos 8 caracteres.</small>
            }
          </label>

          @if (error()) {
            <p class="banner banner-bad" role="alert">{{ error() }}</p>
          }

          <button
            type="submit"
            class="btn btn-lima btn-lg btn-block"
            [disabled]="busy()"
            [attr.aria-busy]="busy() ? 'true' : null"
          >
            @if (busy()) {
              {{ registering() ? 'Creando tu cuenta…' : 'Entrando…' }}
            } @else {
              {{ registering() ? 'Crear cuenta y configurar tienda →' : 'Entrar a mi caja →' }}
            }
          </button>

          <p class="small center muted">
            @if (registering()) {
              ¿Ya tienes cuenta?
              <a routerLink="/login" [queryParams]="nextQueryParams()">Entra a tu caja</a>
            } @else {
              ¿Aún no tienes cuenta?
              <a routerLink="/register" [queryParams]="nextQueryParams()">Registra tu negocio</a>
            }
          </p>
        </form>
      </main>

      <app-site-footer />
    </div>
  `,
})
export default class AuthPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  protected readonly registering = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly next = signal('');
  protected readonly nextQueryParams = computed(() =>
    this.next() ? { next: this.next() } : null,
  );

  protected name = '';
  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit(): void {
    const mode = this.route.snapshot.data['mode'];
    const isRegister = mode === 'register';
    this.registering.set(isRegister);
    this.title.setTitle(
      isRegister ? 'Crea tu cuenta · MiPlante' : 'Entra a tu caja · MiPlante',
    );
    this.next.set(safeNext(this.route.snapshot.queryParamMap.get('next')));

    if (this.api.token()) {
      this.goOn().catch(() => {});
    }
  }

  private async goOn(): Promise<void> {
    const dest = await this.api.destinationAfterSignIn(this.next());
    await this.router.navigateByUrl(dest, { replaceUrl: true });
  }

  private fail(msg: string, input?: ElementRef<HTMLInputElement>): void {
    this.error.set(msg);
    input?.nativeElement.focus();
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    const isRegister = this.registering();
    const trimmedName = this.name.trim();
    const trimmedEmail = this.email.trim();
    const emailEl = this.emailInput()?.nativeElement;

    if (isRegister && !trimmedName) {
      this.fail('Escribe tu nombre.', this.nameInput());
      return;
    }
    if (!trimmedEmail || (emailEl && !emailEl.checkValidity())) {
      this.fail('Escribe un correo válido.', this.emailInput());
      return;
    }
    if (isRegister && this.password.length < 8) {
      this.fail('La contraseña necesita al menos 8 caracteres.', this.passwordInput());
      return;
    }
    if (!this.password) {
      this.fail('Escribe tu contraseña.', this.passwordInput());
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      const { token } = await this.api.post<{ token: string }>(
        isRegister ? '/api/auth/register' : '/api/auth/login',
        isRegister
          ? { name: trimmedName, email: trimmedEmail, password: this.password }
          : { email: trimmedEmail, password: this.password },
      );
      this.api.startSession(token);
      await this.goOn();
    } catch (err: unknown) {
      this.fail((err as Error)?.message || 'No pudimos iniciar sesión.');
    } finally {
      this.busy.set(false);
    }
  }
}
