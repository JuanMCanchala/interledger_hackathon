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
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { MeResponse, WalletInfo } from '../../core/miplante.models';
import {
  MAX_RULES,
  MAX_TOTAL_PERCENT,
  STORAGE_KEYS,
  formatMoney,
  formatThousandsInput,
  normalizeDecimal,
  normalizeWallet,
  previewSplit,
  remember,
  toMinor,
  walletName,
} from '../../core/miplante.utils';
import { SiteFooter, SiteHeader } from '../../shared/ui/site-layout';

interface OnboardWalletDraft {
  id: number;
  label: string;
  destination: string;
  sharePercent: number | null;
  monthlyQuota: string;
  outstanding: string;
  dueDay: number | null;
  examples?: {
    label?: string;
    destination?: string;
    monthlyQuota?: string;
    outstanding?: string;
  };
}

interface OnboardCategoryDraft {
  id: number;
  name: string;
  kind: 'debt' | 'savings';
  icon: string;
  wallets: OnboardWalletDraft[];
}

const PREVIEW_SALE = 10000n * 100n;

const KIND_TEXT: Record<'debt' | 'savings', string> = {
  debt: 'Obligación con cuota mensual',
  savings: 'Ahorro · siempre toma su parte',
};

let nextDraftId = 1;

@Component({
  selector: 'app-onboard',
  imports: [FormsModule, SiteHeader, SiteFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page' },
  template: `
    <div class="container">
      <app-site-header actionLabel="Ya tengo mi caja" actionLink="/merchant" />

      <main class="narrow stack">
        <div class="stack-sm">
          <p class="eyebrow">Configura tu tienda</p>
          <h1 class="h1-sm">Tu tienda en 3 pasos</h1>
          <p class="lead">
            Cada venta paga sola tus obligaciones del mes. Cuando las completas,
            todo lo que entra es ganancia tuya.
          </p>
        </div>

        <ol class="wizard" aria-label="Pasos de la configuración">
          @for (item of stepsMeta; track item.index) {
            <li
              [class.is-current]="step() === item.index"
              [class.is-done]="step() > item.index"
              [attr.aria-current]="step() === item.index ? 'step' : null"
            >
              <button
                type="button"
                [disabled]="item.index > reached()"
                (click)="jumpToStep(item.index)"
              >
                <span class="wizard-n">{{ item.index + 1 }}</span> {{ item.label }}
              </button>
            </li>
          }
        </ol>

        <form class="stack" (ngSubmit)="submitStep()" (input)="formError.set('')" novalidate>
          <!-- Paso 1: la tienda -->
          @if (step() === 0) {
            <section class="card stack wizard-panel" aria-labelledby="step1-title">
              <h2 class="step-title" id="step1-title">
                <span class="step-number" aria-hidden="true">1</span> Tu tienda
              </h2>
              <label class="field">
                <span>¿Cómo se llama tu negocio?</span>
                <input
                  name="businessName"
                  [ngModel]="businessName()"
                  (ngModelChange)="businessName.set($event)"
                  maxlength="80"
                  autocomplete="organization"
                  placeholder="Ej: Tienda La Esquina"
                />
              </label>
              <label class="field">
                <span>¿Cuál es la billetera de tu negocio?</span>
                <input
                  name="businessWallet"
                  [ngModel]="businessWallet()"
                  (ngModelChange)="onWalletInput($event)"
                  (change)="verifyWallet()"
                  maxlength="300"
                  autocomplete="off"
                  spellcheck="false"
                  autocapitalize="off"
                  placeholder="Ej: mi-tienda"
                />
                <small class="hint">
                  Escribe solo su nombre. Ahí te pagan tus clientes y de ahí salen
                  los pagos automáticos.
                </small>
                <small
                  [class]="'check ' + walletCheckClass()"
                  aria-live="polite"
                >
                  {{ walletCheckText() }}
                </small>
              </label>
            </section>
          }

          <!-- Paso 2: billeteras por categoría -->
          @if (step() === 1) {
            <section class="card stack wizard-panel" aria-labelledby="step2-title">
              <h2 class="step-title" id="step2-title">
                <span class="step-number" aria-hidden="true">2</span> ¿A dónde va
                cada parte?
              </h2>
              <p class="muted small">
                Agrupa tus billeteras por categoría: puedes tener varios
                proveedores o créditos y crear tus propias categorías. De cada
                venta se aparta la parte de cada obligación hasta su cuota del
                mes, y en su día de pago se le envía todo junto.
              </p>

              <div class="stack">
                @for (cat of categories(); track cat.id) {
                  <section class="category stack-sm">
                    <div class="row between">
                      <div class="category-head">
                        <span class="goal-icon" aria-hidden="true">{{ cat.icon }}</span>
                        <div>
                          <h3>{{ cat.name }}</h3>
                          <p class="muted small">{{ kindText(cat.kind) }}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-ghost"
                        (click)="removeCategory(cat.id)"
                      >
                        Quitar categoría
                      </button>
                    </div>

                    <div class="category-wallets stack-sm">
                      @for (w of cat.wallets; track w.id) {
                        <fieldset class="wallet-row">
                          <legend class="sr-only">Billetera</legend>
                          <label class="field">
                            <span>Nombre</span>
                            <input
                              [name]="'label-' + w.id"
                              [ngModel]="w.label"
                              (ngModelChange)="updateWallet(cat.id, w.id, { label: $event })"
                              maxlength="60"
                              [placeholder]="w.examples?.label || 'Ej: Distribuidora'"
                            />
                          </label>
                          <label class="field">
                            <span>Billetera</span>
                            <input
                              [name]="'dest-' + w.id"
                              [ngModel]="w.destination"
                              (ngModelChange)="updateWallet(cat.id, w.id, { destination: $event })"
                              maxlength="300"
                              autocomplete="off"
                              spellcheck="false"
                              autocapitalize="off"
                              [placeholder]="w.examples?.destination || 'Ej: distribuidora-central'"
                            />
                          </label>
                          <label class="field">
                            <span>% de cada venta</span>
                            <input
                              [name]="'share-' + w.id"
                              type="number"
                              min="0.01"
                              max="99"
                              step="0.01"
                              inputmode="decimal"
                              [ngModel]="w.sharePercent"
                              (ngModelChange)="updateWallet(cat.id, w.id, { sharePercent: $event })"
                            />
                          </label>
                          @if (cat.kind === 'debt') {
                            <label class="field">
                              <span>Cuota del mes</span>
                              <input
                                [name]="'quota-' + w.id"
                                inputmode="numeric"
                                autocomplete="off"
                                [placeholder]="w.examples?.monthlyQuota || '200.000'"
                                [ngModel]="w.monthlyQuota"
                                (ngModelChange)="updateWalletMoney(cat.id, w.id, 'monthlyQuota', $event)"
                              />
                            </label>
                            <label class="field">
                              <span>Deuda total (opcional)</span>
                              <input
                                [name]="'out-' + w.id"
                                inputmode="numeric"
                                autocomplete="off"
                                [placeholder]="w.examples?.outstanding || '1.200.000'"
                                [ngModel]="w.outstanding"
                                (ngModelChange)="updateWalletMoney(cat.id, w.id, 'outstanding', $event)"
                              />
                            </label>
                            <label class="field">
                              <span>Día de pago (1–28)</span>
                              <input
                                [name]="'due-' + w.id"
                                type="number"
                                min="1"
                                max="28"
                                step="1"
                                inputmode="numeric"
                                placeholder="25"
                                [ngModel]="w.dueDay"
                                (ngModelChange)="updateWallet(cat.id, w.id, { dueDay: $event })"
                              />
                            </label>
                          }
                          <button
                            type="button"
                            class="btn btn-danger remove-wallet"
                            (click)="removeWallet(cat.id, w.id)"
                          >
                            Quitar
                          </button>
                        </fieldset>
                      }
                    </div>

                    <button
                      type="button"
                      class="btn btn-secondary add-wallet"
                      [disabled]="totalWalletsCount() >= maxRules"
                      (click)="addWalletToCategory(cat.id)"
                    >
                      + Agregar billetera
                    </button>
                  </section>
                }
              </div>

              <div class="new-category stack-sm">
                <p class="field-legend">Crear otra categoría</p>
                <div class="new-category-row">
                  <label class="field">
                    <span>Nombre</span>
                    <input
                      name="newCategoryName"
                      [(ngModel)]="newCategoryName"
                      maxlength="40"
                      placeholder="Ej: Arriendo"
                    />
                  </label>
                  <label class="field">
                    <span>Tipo</span>
                    <select name="newCategoryKind" [(ngModel)]="newCategoryKind">
                      <option value="debt">Obligación con cuota mensual</option>
                      <option value="savings">Ahorro</option>
                    </select>
                  </label>
                  <button type="button" class="btn btn-secondary" (click)="createCategory()">
                    + Crear
                  </button>
                </div>
              </div>

              <p
                class="small"
                [class.error-text]="totalSharePercent() > maxTotalPercent"
                aria-live="polite"
              >
                Entre todas toman {{ totalSharePercent().toLocaleString('es-CO') }}% de cada venta (máximo {{ maxTotalPercent }}%).{{
                  totalWalletsCount() >= maxRules
                    ? ' Llegaste al máximo de ' + maxRules + ' billeteras.'
                    : ''
                }}
              </p>
            </section>
          }

          <!-- Paso 3: límite mensual y resumen -->
          @if (step() === 2) {
            <section class="card stack wizard-panel" aria-labelledby="step3-title">
              <h2 class="step-title" id="step3-title">
                <span class="step-number" aria-hidden="true">3</span> Tu límite
                mensual
              </h2>
              <label class="field">
                <span>¿Máximo cuánto puede salir de tu billetera en un mes?</span>
                <input
                  name="monthlyCap"
                  class="input-xl"
                  inputmode="numeric"
                  autocomplete="off"
                  placeholder="Ej: 500.000"
                  [ngModel]="effectiveMonthlyCap()"
                  (ngModelChange)="onCapInput($event)"
                />
                <small class="hint">{{ capHint() }}</small>
              </label>
              <p class="hint">
                Es lo que apruebas en tu billetera. Se renueva el primer día de
                cada mes y lo puedes cancelar cuando quieras.
              </p>

              <div class="stack-sm" aria-live="polite">
                <h3>Así queda cada venta de {{ peso(previewSaleMinor) }}</h3>
                <div class="stacked-bar" aria-hidden="true">
                  <span
                    class="seg-kept"
                    [style.width.%]="previewWidth(preview().kept)"
                  ></span>
                  @for (item of preview().items; track $index) {
                    <span
                      [class]="item.kind === 'debt' ? 'seg-debt' : 'seg-savings'"
                      [style.width.%]="previewWidth(item.amount)"
                    ></span>
                  }
                </div>
                <ul class="split">
                  <li class="split-item is-kept">
                    <span class="split-label">Ganancia para ti</span>
                    <span class="split-amount">{{ peso(preview().kept) }}</span>
                  </li>
                  @for (item of preview().items; track $index) {
                    <li class="split-item">
                      <span class="split-label">{{ item.label }}</span>
                      <span class="split-amount">{{ peso(item.amount) }}</span>
                    </li>
                  }
                </ul>
              </div>

              <div class="stack-sm">
                <h3>Lo que se paga cada mes</h3>
                <ul class="list">
                  @for (w of validWallets(); track w.id) {
                    <li class="row between small">
                      <span>
                        <strong>{{ w.label || w.category }}</strong>
                        <span class="muted"> · {{ w.category }}</span>
                      </span>
                      <span class="num">
                        {{
                          w.kind === 'debt'
                            ? w.sharePercent + '% hasta ' + pesos(w.monthlyQuota) + ' al mes, se paga el día ' + w.dueDay
                            : w.sharePercent + '% de cada venta'
                        }}
                      </span>
                    </li>
                  }
                </ul>
                <p class="hint">
                  Cuando una obligación completa su cuota del mes, su parte de cada
                  venta vuelve a ser ganancia tuya. El ahorro siempre toma su parte.
                </p>
              </div>
            </section>
          }

          @if (formError()) {
            <p class="banner banner-bad" role="alert">{{ formError() }}</p>
          }

          @if (step() === 2) {
            <p class="banner banner-info">
              Ahora te llevamos a tu billetera. Entra con la cuenta dueña de
              <strong>{{ checkedWallet()?.name || 'tu billetera' }}</strong>
              y toca <strong>Aceptar</strong>. Después vuelves aquí solo.
            </p>
          }

          <div class="wizard-nav">
            @if (step() > 0) {
              <button type="button" class="btn btn-ghost" (click)="prevStep()">
                ← Atrás
              </button>
            }
            <button
              type="submit"
              class="btn btn-primary btn-lg next-btn"
              [disabled]="busy()"
              [attr.aria-busy]="busy() ? 'true' : null"
            >
              @if (busy()) {
                Abriendo tu billetera…
              } @else if (step() === 2) {
                Autorizar en mi billetera →
              } @else {
                Siguiente →
              }
            </button>
          </div>
        </form>
      </main>

      <app-site-footer />
    </div>
  `,
})
export default class OnboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  protected readonly maxRules = MAX_RULES;
  protected readonly maxTotalPercent = MAX_TOTAL_PERCENT;
  protected readonly previewSaleMinor = PREVIEW_SALE;
  protected readonly stepsMeta = [
    { index: 0, label: 'Tienda' },
    { index: 1, label: 'Billeteras' },
    { index: 2, label: 'Límite' },
  ];

  protected readonly step = signal(0);
  protected readonly reached = signal(0);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  protected readonly businessName = signal('');
  protected readonly businessWallet = signal('');
  protected readonly checkedWallet = signal<WalletInfo | null>(null);
  protected readonly walletCheckText = signal('');
  protected readonly walletCheckClass = signal('');

  protected readonly categories = signal<OnboardCategoryDraft[]>([]);
  protected newCategoryName = '';
  protected newCategoryKind: 'debt' | 'savings' = 'debt';

  protected readonly capTouched = signal(false);
  protected readonly customCap = signal('');

  protected readonly flatWallets = computed(() =>
    this.categories().flatMap((cat) =>
      cat.wallets.map((w) => ({
        ...w,
        category: cat.name,
        kind: cat.kind,
        sharePercent:
          w.sharePercent !== null && Number.isFinite(Number(w.sharePercent))
            ? Math.round(Number(w.sharePercent) * 100) / 100
            : NaN,
        normalizedQuota: normalizeDecimal(w.monthlyQuota),
        normalizedOutstanding: normalizeDecimal(w.outstanding),
        dueDayNum: w.dueDay !== null ? Number(w.dueDay) : NaN,
      })),
    ),
  );

  protected readonly totalWalletsCount = computed(() => this.flatWallets().length);

  protected readonly validWallets = computed(() =>
    this.flatWallets().filter(
      (w) => Number.isFinite(w.sharePercent) && w.sharePercent > 0,
    ),
  );

  protected readonly totalSharePercent = computed(() =>
    this.flatWallets().reduce(
      (sum, w) => sum + (Number.isFinite(w.sharePercent) ? w.sharePercent : 0),
      0,
    ),
  );

  protected readonly quotasMinor = computed(() =>
    this.validWallets()
      .filter((w) => w.kind === 'debt' && w.normalizedQuota)
      .reduce((sum, w) => sum + toMinor(w.normalizedQuota, 2), 0n),
  );

  protected readonly suggestedCapString = computed(() => {
    const quotas = this.quotasMinor();
    const step = 10000n * 100n;
    const wanted = quotas + quotas / 2n;
    const rounded = ((wanted + step - 1n) / step) * step;
    const minor = rounded > 0n ? rounded : 100000n * 100n;
    return (Number(minor) / 100).toLocaleString('es-CO');
  });

  protected readonly effectiveMonthlyCap = computed(() =>
    this.capTouched() ? this.customCap() : this.suggestedCapString(),
  );

  protected readonly capHint = computed(() => {
    const quotas = this.quotasMinor();
    return quotas > 0n
      ? `Tus cuotas del mes suman ${this.peso(quotas)}: el límite debe ser al menos eso. Lo que sobre deja espacio para tu ahorro.`
      : 'Lo que sobre de tus cuotas deja espacio para tu ahorro.';
  });

  protected readonly preview = computed(() =>
    previewSplit(
      PREVIEW_SALE,
      this.validWallets().map((w) => ({
        label: w.label.trim() || w.category,
        kind: w.kind,
        shareBps: Math.round(w.sharePercent * 100),
        outstandingMinor: w.normalizedOutstanding
          ? toMinor(w.normalizedOutstanding, 2)
          : undefined,
      })),
    ),
  );

  ngOnInit(): void {
    this.title.setTitle('Configura tu tienda · MiPlante');
    this.initDefaultCategories();
    if (this.api.requireSession()) {
      this.start().catch((err: unknown) =>
        this.formError.set((err as Error)?.message || 'Error al iniciar'),
      );
    }
  }

  private initDefaultCategories(): void {
    this.categories.set([
      {
        id: nextDraftId++,
        name: 'Proveedores',
        kind: 'debt',
        icon: '📦',
        wallets: [
          {
            id: nextDraftId++,
            label: '',
            destination: '',
            sharePercent: 10,
            monthlyQuota: '',
            outstanding: '',
            dueDay: 28,
            examples: {
              label: 'Ej: Distribuidora Central',
              destination: 'Ej: distribuidora-central',
              monthlyQuota: 'Ej: 200.000',
            },
          },
        ],
      },
      {
        id: nextDraftId++,
        name: 'Microcréditos',
        kind: 'debt',
        icon: '💳',
        wallets: [
          {
            id: nextDraftId++,
            label: '',
            destination: '',
            sharePercent: 15,
            monthlyQuota: '',
            outstanding: '',
            dueDay: 28,
            examples: {
              label: 'Ej: Cooperativa de crédito',
              destination: 'Ej: cooperativa-credito',
              monthlyQuota: 'Ej: 100.000',
              outstanding: 'Ej: 600.000',
            },
          },
        ],
      },
      {
        id: nextDraftId++,
        name: 'Ahorro',
        kind: 'savings',
        icon: '🐷',
        wallets: [
          {
            id: nextDraftId++,
            label: '',
            destination: '',
            sharePercent: 5,
            monthlyQuota: '',
            outstanding: '',
            dueDay: null,
            examples: {
              label: 'Ej: Fondo de emergencia',
              destination: 'Ej: mi-ahorro',
            },
          },
        ],
      },
    ]);
  }

  private async start(): Promise<void> {
    const { merchant } = await this.api.get<MeResponse>('/api/auth/me');
    if (merchant) {
      await this.router.navigate(['/merchant'], {
        queryParams: { id: merchant.id },
        replaceUrl: true,
      });
      return;
    }
    const savedWallet = remember.get(STORAGE_KEYS.merchantWallet);
    if (savedWallet) {
      this.businessWallet.set(walletName(savedWallet));
      await this.verifyWallet();
    }
  }

  protected kindText(kind: 'debt' | 'savings'): string {
    return KIND_TEXT[kind];
  }

  protected peso(minor: bigint): string {
    return formatMoney(Number(minor) / 100, 'COP');
  }

  protected pesos(raw: string): string {
    const dec = normalizeDecimal(raw);
    return dec ? this.peso(toMinor(dec, 2)) : '—';
  }

  protected previewWidth(minor: bigint): number {
    return (Number(minor) * 100) / Number(PREVIEW_SALE);
  }

  protected onWalletInput(val: string): void {
    this.businessWallet.set(val);
    this.checkedWallet.set(null);
  }

  protected async verifyWallet(): Promise<WalletInfo | null> {
    const value = this.businessWallet().trim();
    this.checkedWallet.set(null);
    if (!value) {
      this.walletCheckText.set('');
      this.walletCheckClass.set('');
      return null;
    }
    this.walletCheckClass.set('');
    this.walletCheckText.set('Buscando tu billetera…');
    try {
      const info = await this.api.checkWallet(value);
      this.walletCheckClass.set('check-ok');
      this.walletCheckText.set(
        `✓ Encontramos tu billetera ${info.name} (${info.currency})`,
      );
      this.checkedWallet.set(info);
      return info;
    } catch (err: unknown) {
      this.walletCheckClass.set('check-bad');
      this.walletCheckText.set((err as Error)?.message || 'Billetera inválida');
      return null;
    }
  }

  protected updateWallet(
    catId: number,
    walletId: number,
    patch: Partial<OnboardWalletDraft>,
  ): void {
    this.categories.update((cats) =>
      cats.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              wallets: c.wallets.map((w) =>
                w.id !== walletId ? w : { ...w, ...patch },
              ),
            },
      ),
    );
  }

  protected updateWalletMoney(
    catId: number,
    walletId: number,
    field: 'monthlyQuota' | 'outstanding',
    raw: string,
  ): void {
    this.updateWallet(catId, walletId, { [field]: formatThousandsInput(raw) });
  }

  protected addWalletToCategory(catId: number): void {
    if (this.totalWalletsCount() >= MAX_RULES) return;
    this.categories.update((cats) =>
      cats.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              wallets: [
                ...c.wallets,
                {
                  id: nextDraftId++,
                  label: '',
                  destination: '',
                  sharePercent: null,
                  monthlyQuota: '',
                  outstanding: '',
                  dueDay: c.kind === 'debt' ? 28 : null,
                },
              ],
            },
      ),
    );
  }

  protected removeWallet(catId: number, walletId: number): void {
    this.categories.update((cats) =>
      cats.map((c) =>
        c.id !== catId
          ? c
          : { ...c, wallets: c.wallets.filter((w) => w.id !== walletId) },
      ),
    );
  }

  protected removeCategory(catId: number): void {
    this.categories.update((cats) => cats.filter((c) => c.id !== catId));
  }

  protected createCategory(): void {
    const name = this.newCategoryName.trim();
    if (!name) return;
    const exists = this.categories().some(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      this.formError.set(`Ya tienes la categoría "${name}".`);
      return;
    }
    const kind = this.newCategoryKind;
    const canAddWallet = this.totalWalletsCount() < MAX_RULES;
    this.categories.update((cats) => [
      ...cats,
      {
        id: nextDraftId++,
        name,
        kind,
        icon: kind === 'debt' ? '🧾' : '🌱',
        wallets: canAddWallet
          ? [
              {
                id: nextDraftId++,
                label: '',
                destination: '',
                sharePercent: null,
                monthlyQuota: '',
                outstanding: '',
                dueDay: kind === 'debt' ? 28 : null,
              },
            ]
          : [],
      },
    ]);
    this.newCategoryName = '';
  }

  protected onCapInput(raw: string): void {
    this.capTouched.set(true);
    this.customCap.set(formatThousandsInput(raw));
  }

  private fail(msg: string): boolean {
    this.formError.set(msg);
    return false;
  }

  private async checkShop(): Promise<boolean> {
    if (!this.businessName().trim()) {
      return this.fail('Escribe el nombre de tu negocio.');
    }
    if (!this.businessWallet().trim()) {
      return this.fail('Escribe el nombre de tu billetera.');
    }
    if (!(this.checkedWallet() || (await this.verifyWallet()))) {
      return this.fail('Revisa el nombre de tu billetera.');
    }
    return true;
  }

  private checkWallets(): boolean {
    const wallets = this.flatWallets();
    if (wallets.length === 0) {
      return this.fail('Agrega al menos una billetera para pagar con tus ventas.');
    }
    for (const w of wallets) {
      const label = w.label.trim();
      const dest = w.destination.trim();
      const where = `${w.category}${label ? ` · ${label}` : ''}`;
      if (!label) {
        return this.fail(`Ponle un nombre a la billetera de ${w.category}.`);
      }
      if (!dest) {
        return this.fail(`Escribe la billetera de "${where}".`);
      }
      if (
        !Number.isFinite(w.sharePercent) ||
        w.sharePercent < 0.01 ||
        w.sharePercent > MAX_TOTAL_PERCENT
      ) {
        return this.fail(
          `En "${where}" el porcentaje debe estar entre 0,01 y ${MAX_TOTAL_PERCENT}.`,
        );
      }
      if (w.kind === 'debt' && !w.normalizedQuota) {
        return this.fail(
          `Escribe cuánto pagas al mes a "${where}", por ejemplo 200.000.`,
        );
      }
      if (
        w.kind === 'debt' &&
        (!Number.isInteger(w.dueDayNum) || w.dueDayNum < 1 || w.dueDayNum > 28)
      ) {
        return this.fail(
          `Escribe el día del mes en que le pagas a "${where}" (del 1 al 28).`,
        );
      }
    }
    const total = wallets.reduce((sum, w) => sum + w.sharePercent, 0);
    if (total > MAX_TOTAL_PERCENT) {
      return this.fail(
        `Entre todas suman ${total.toLocaleString('es-CO')}% de cada venta. Baja alguna: lo máximo es ${MAX_TOTAL_PERCENT}%, para que siempre te quede una parte.`,
      );
    }
    return true;
  }

  private checkCap(): boolean {
    const cap = normalizeDecimal(this.effectiveMonthlyCap());
    if (!cap) {
      return this.fail('Escribe tu límite mensual, por ejemplo 500.000.');
    }
    const quotas = this.quotasMinor();
    if (toMinor(cap, 2) < quotas) {
      return this.fail(
        `Tus cuotas del mes suman ${this.peso(quotas)}: el límite mensual debe ser al menos eso.`,
      );
    }
    return true;
  }

  private async runCheck(index: number): Promise<boolean> {
    if (index === 0) return this.checkShop();
    if (index === 1) return this.checkWallets();
    return this.checkCap();
  }

  private showStep(index: number): void {
    this.step.set(index);
    this.reached.update((r) => Math.max(r, index));
    this.formError.set('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected prevStep(): void {
    this.showStep(Math.max(0, this.step() - 1));
  }

  protected async jumpToStep(target: number): Promise<void> {
    const current = this.step();
    if (target === current || target > this.reached()) return;
    for (let at = current; at < target; at += 1) {
      if (!(await this.runCheck(at))) return;
    }
    this.showStep(target);
  }

  protected async submitStep(): Promise<void> {
    if (this.busy()) return;
    this.formError.set('');
    const current = this.step();
    if (!(await this.runCheck(current))) return;
    if (current < 2) {
      this.showStep(current + 1);
      return;
    }

    for (let i = 0; i <= 2; i++) {
      if (!(await this.runCheck(i))) return;
    }

    this.busy.set(true);
    try {
      const checked = this.checkedWallet()!;
      const body = {
        name: this.businessName().trim(),
        wallet: checked.wallet,
        monthlyCap: normalizeDecimal(this.effectiveMonthlyCap()),
        rules: this.flatWallets().map((w) => ({
          label: w.label.trim(),
          category: w.category,
          kind: w.kind,
          destination: normalizeWallet(w.destination),
          sharePercent: w.sharePercent,
          ...(w.kind === 'debt'
            ? { monthlyQuota: w.normalizedQuota, dueDay: w.dueDayNum }
            : {}),
          ...(w.kind === 'debt' && w.normalizedOutstanding
            ? { outstanding: w.normalizedOutstanding }
            : {}),
        })),
      };
      const { redirectUrl } = await this.api.post<{ redirectUrl: string }>(
        '/api/merchants',
        body,
      );
      remember.set(STORAGE_KEYS.merchantWallet, body.wallet);
      window.location.href = redirectUrl;
    } catch (err: unknown) {
      this.formError.set((err as Error)?.message || 'No pudimos guardar tu tienda.');
    } finally {
      this.busy.set(false);
    }
  }
}
