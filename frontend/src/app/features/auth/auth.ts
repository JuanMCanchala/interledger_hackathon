import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { safeNext } from '../../core/miplante.utils';
import { Logo } from '../../shared/brand/logo';
import { Plant, PlantStage } from '../../shared/brand/plant';
import { Wizard } from '../../shared/ui/wizard';

const MIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-auth',
  imports: [FormsModule, RouterLink, Logo, Plant, Wizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page' },
  template: `
    <div class="flow">
      <aside class="flow-aside">
        <a class="flow-logo" routerLink="/" aria-label="MiPlante, volver al inicio">
          <app-logo aria-hidden="true" />
        </a>
        <div class="flow-aside-copy">
          <h1>{{ registering() ? 'Sembremos tu negocio' : 'Qué bueno verte de nuevo' }}</h1>
          <p class="lead">
            {{
              registering()
                ? 'En tres pasos tienes tu cuenta. Después armamos tus bolsillos y cada venta se reparte sola.'
                : 'Entra a tu caja para cobrar, ver cuánto llevas hoy y cómo van tus bolsillos.'
            }}
          </p>
        </div>
        <app-plant class="flow-plant" [stage]="plantStage()" />
      </aside>

      <main class="flow-main">
        <div class="card flow-card">
          @if (registering()) {
            <app-wizard
              [step]="step()"
              [total]="3"
              [busy]="busy()"
              [nextLabel]="step() < 2 ? 'Continuar' : 'Crear mi cuenta'"
              busyLabel="Creando tu cuenta…"
              (back)="goBack()"
              (next)="advance()"
            >
              @switch (step()) {
                @case (0) {
                  <label class="flow-question" for="auth-name">¿Cómo te llamas?</label>
                  <p class="flow-help">Así te saludamos cuando abras tu caja.</p>
                  <input
                    id="auth-name"
                    class="input-xl"
                    [(ngModel)]="name"
                    maxlength="80"
                    autocomplete="name"
                    placeholder="Ej: Nelly Restrepo"
                  />
                }
                @case (1) {
                  <label class="flow-question" for="auth-email">¿Cuál es tu correo, {{ firstName() }}?</label>
                  <p class="flow-help">Con él entras a tu caja desde cualquier celular.</p>
                  <input
                    id="auth-email"
                    class="input-xl"
                    type="email"
                    [(ngModel)]="email"
                    maxlength="200"
                    autocomplete="email"
                    autocapitalize="off"
                    spellcheck="false"
                    placeholder="tu@correo.com"
                  />
                }
                @case (2) {
                  <label class="flow-question" for="auth-password">Crea una contraseña</label>
                  <p class="flow-help">Usa al menos {{ minPassword }} caracteres. Solo tú la conoces.</p>
                  <div class="input-with-action">
                    <input
                      id="auth-password"
                      class="input-xl"
                      [type]="showPassword() ? 'text' : 'password'"
                      [(ngModel)]="password"
                      maxlength="200"
                      autocomplete="new-password"
                    />
                    <button type="button" class="input-action" (click)="showPassword.update((s) => !s)">
                      {{ showPassword() ? 'Ocultar' : 'Mostrar' }}
                    </button>
                  </div>
                  <p class="flow-meter" [class.is-ok]="password.length >= minPassword" aria-live="polite">
                    {{
                      password.length >= minPassword
                        ? '✓ Lista'
                        : 'Te faltan ' + (minPassword - password.length) + ' caracteres'
                    }}
                  </p>
                }
              }
              @if (error()) {
                <p class="banner banner-bad" role="alert">{{ error() }}</p>
              }
            </app-wizard>
          } @else {
            <form class="flow-login" novalidate (ngSubmit)="login()">
              <h2 class="flow-question">Entra a tu caja</h2>
              <label class="field">
                <span>Correo</span>
                <input
                  name="email"
                  type="email"
                  [(ngModel)]="email"
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
                    name="password"
                    [type]="showPassword() ? 'text' : 'password'"
                    [(ngModel)]="password"
                    maxlength="200"
                    autocomplete="current-password"
                  />
                  <button type="button" class="input-action" (click)="showPassword.update((s) => !s)">
                    {{ showPassword() ? 'Ocultar' : 'Mostrar' }}
                  </button>
                </div>
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
                {{ busy() ? 'Entrando…' : 'Entrar' }}
              </button>
            </form>
          }

          <p class="flow-switch">
            @if (registering()) {
              ¿Ya tienes cuenta?
              <a routerLink="/login" [queryParams]="nextQueryParams()">Entra a tu caja</a>
            } @else {
              ¿Primera vez?
              <a routerLink="/register" [queryParams]="nextQueryParams()">Crea tu cuenta</a>
            }
          </p>
        </div>
      </main>
    </div>
  `,
})
export default class AuthPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);

  protected readonly minPassword = MIN_PASSWORD;
  protected readonly registering = signal(false);
  protected readonly step = signal(0);
  protected readonly showPassword = signal(false);
  protected readonly next = signal('');
  protected readonly nextQueryParams = computed(() => (this.next() ? { next: this.next() } : null));

  protected name = '';
  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  /** The aside plant grows with each answered question: seed, sprout, bloom. */
  protected readonly plantStage = computed<PlantStage>(() =>
    !this.registering() ? 'bloom' : (['seed', 'sprout', 'bloom'] as const)[this.step()],
  );

  protected firstName(): string {
    return this.name.trim().split(/\s+/)[0] ?? '';
  }

  ngOnInit(): void {
    const isRegister = this.route.snapshot.data['mode'] === 'register';
    this.registering.set(isRegister);
    this.title.setTitle(isRegister ? 'Crea tu cuenta · MiPlante' : 'Entra a tu caja · MiPlante');
    this.next.set(safeNext(this.route.snapshot.queryParamMap.get('next')));
    if (this.api.token()) this.goOn().catch(() => {});
  }

  protected goBack(): void {
    this.error.set('');
    this.step.update((s) => Math.max(0, s - 1));
  }

  /** Validates the current question, then moves on or creates the account. */
  protected async advance(): Promise<void> {
    const problem = this.registerProblem(this.step());
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.error.set('');
    if (this.step() < 2) {
      this.step.update((s) => s + 1);
      return;
    }
    await this.send('/api/auth/register', {
      name: this.name.trim(),
      email: this.email.trim(),
      password: this.password,
    });
  }

  protected async login(): Promise<void> {
    if (!EMAIL.test(this.email.trim())) {
      this.error.set('Escribe un correo válido.');
      return;
    }
    if (!this.password) {
      this.error.set('Escribe tu contraseña.');
      return;
    }
    await this.send('/api/auth/login', { email: this.email.trim(), password: this.password });
  }

  private registerProblem(step: number): string {
    if (step === 0 && !this.name.trim()) return 'Escribe tu nombre para seguir.';
    if (step === 1 && !EMAIL.test(this.email.trim())) return 'Revisa tu correo, por ejemplo nelly@correo.com.';
    if (step === 2 && this.password.length < MIN_PASSWORD) {
      return `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`;
    }
    return '';
  }

  private async send(path: string, body: Record<string, string>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { token } = await this.api.post<{ token: string }>(path, body);
      this.api.startSession(token);
      await this.goOn();
    } catch (err: unknown) {
      this.error.set((err as Error)?.message || 'No pudimos entrar. Intenta de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  private async goOn(): Promise<void> {
    const dest = await this.api.destinationAfterSignIn(this.next());
    await this.router.navigateByUrl(dest, { replaceUrl: true });
  }
}
