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
import { SiteFooter, SiteHeader } from '../../shared/ui/site-layout';

@Component({
  selector: 'app-auth',
  imports: [FormsModule, RouterLink, SiteHeader, SiteFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page' },
  template: `
    <div class="container">
      <app-site-header
        [actionLabel]="registering() ? 'Ya tengo cuenta' : 'Crear cuenta'"
        [actionLink]="registering() ? '/login' : '/register'"
        [actionQueryParams]="nextQueryParams()"
      />

      <main class="narrow stack">
        <div class="stack-sm">
          <p class="eyebrow">{{ registering() ? 'Registro · 1 minuto' : 'Tu caja' }}</p>
          <h1 class="h1-sm">{{ registering() ? 'Crea tu cuenta' : 'Entra a tu caja' }}</h1>
          <p class="lead">
            {{
              registering()
                ? 'Con ella entras a tu caja desde cualquier equipo. Después configuras tu tienda y a dónde va cada parte de tus ventas.'
                : 'Con tu correo y tu contraseña, desde cualquier celular o computador.'
            }}
          </p>
        </div>

        <form class="card stack" (ngSubmit)="submit()" (input)="error.set('')" novalidate>
          @if (registering()) {
            <label class="field">
              <span>Tu nombre</span>
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
            <span>Correo</span>
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
            <input
              #passwordInput
              name="password"
              type="password"
              [(ngModel)]="password"
              required
              [attr.minlength]="registering() ? 8 : null"
              maxlength="200"
              [attr.autocomplete]="registering() ? 'new-password' : 'current-password'"
            />
            @if (registering()) {
              <small class="hint">Al menos 8 caracteres.</small>
            }
          </label>

          @if (error()) {
            <p class="banner banner-bad" role="alert">{{ error() }}</p>
          }

          <button
            type="submit"
            class="btn btn-primary btn-lg btn-block"
            [disabled]="busy()"
            [attr.aria-busy]="busy() ? 'true' : null"
          >
            @if (busy()) {
              {{ registering() ? 'Creando tu cuenta…' : 'Entrando…' }}
            } @else {
              {{ registering() ? 'Crear cuenta y seguir' : 'Entrar' }}
            }
          </button>

          <p class="small center">
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
