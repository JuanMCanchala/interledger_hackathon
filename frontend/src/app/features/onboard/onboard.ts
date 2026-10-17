import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
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
import { Doodle, DoodleName } from '../../shared/brand/doodle';
import { Logo } from '../../shared/brand/logo';
import { Wizard } from '../../shared/ui/wizard';

type Kind = 'debt' | 'savings';

interface WalletDraft {
  id: number;
  label: string;
  destination: string;
  sharePercent: number | null;
  monthlyQuota: string;
  outstanding: string;
  dueDay: number | null;
}

interface Pocket {
  id: number;
  name: string;
  kind: Kind;
  doodle: DoodleName;
  hint: string;
  wallets: WalletDraft[];
}

interface Preset {
  name: string;
  kind: Kind;
  doodle: DoodleName;
  hint: string;
  share: number;
}

const PRESETS: readonly Preset[] = [
  { name: 'Proveedores', kind: 'debt', doodle: 'pago', hint: 'A quien te surte la tienda', share: 10 },
  { name: 'Microcrédito', kind: 'debt', doodle: 'calculadora', hint: 'Tu préstamo se paga según vendes', share: 5 },
  { name: 'Ahorro', kind: 'savings', doodle: 'alcancia', hint: 'Para los días flojos', share: 5 },
  { name: 'Arriendo', kind: 'debt', doodle: 'billetera', hint: 'El local o la casa', share: 5 },
];
const DEFAULT_PICKS = ['Proveedores', 'Microcrédito', 'Ahorro'];
const PREVIEW_SALE = 10000n * 100n;
const DEFAULT_DUE_DAY = 28;
const SLIDER_MAX = 40;

let nextId = 1;

const newWallet = (kind: Kind, share: number | null): WalletDraft => ({
  id: nextId++,
  label: '',
  destination: '',
  sharePercent: share,
  monthlyQuota: '',
  outstanding: '',
  dueDay: kind === 'debt' ? DEFAULT_DUE_DAY : null,
});

const newPocket = (name: string, kind: Kind, doodle: DoodleName, hint: string, share: number | null): Pocket => ({
  id: nextId++,
  name,
  kind,
  doodle,
  hint,
  wallets: [newWallet(kind, share)],
});

const percent = (value: number | null): number =>
  value !== null && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : NaN;

@Component({
  selector: 'app-onboard',
  imports: [FormsModule, RouterLink, Doodle, Logo, Wizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'miplante-page' },
  templateUrl: './onboard.html',
})
export default class OnboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  protected readonly presets = PRESETS;
  protected readonly maxTotalPercent = MAX_TOTAL_PERCENT;
  protected readonly sliderMax = SLIDER_MAX;
  protected readonly previewSaleText = formatMoney(Number(PREVIEW_SALE) / 100, 'COP');

  protected readonly step = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected businessName = '';
  protected readonly businessWallet = signal('');
  protected readonly checkedWallet = signal<WalletInfo | null>(null);
  /** Destination wallets that failed to check, by wallet draft id. */
  protected readonly walletErrors = signal<Record<number, string>>({});
  protected readonly walletCheck = signal<{ text: string; ok: boolean } | null>(null);

  protected readonly pockets = signal<Pocket[]>(
    PRESETS.filter((p) => DEFAULT_PICKS.includes(p.name)).map((p) =>
      newPocket(p.name, p.kind, p.doodle, p.hint, p.share),
    ),
  );
  protected customName = '';
  protected customKind: Kind = 'debt';

  protected readonly capTouched = signal(false);
  protected readonly customCap = signal('');

  /** Fixed steps around each chosen pocket: who it pays, then (for debts) how much and when. */
  protected readonly steps = computed(() => [
    'shop',
    'wallet',
    'pick',
    ...this.pockets().flatMap((p) => (p.kind === 'debt' ? [`pocket:${p.id}`, `quota:${p.id}`] : [`pocket:${p.id}`])),
    'cap',
    'review',
  ]);
  protected readonly stepId = computed(() => this.steps()[this.step()]);
  protected readonly isQuotaStep = computed(() => this.stepId().startsWith('quota:'));
  protected readonly currentPocket = computed(() => {
    const id = this.stepId().split(':')[1];
    return id ? this.pockets().find((p) => String(p.id) === id) ?? null : null;
  });

  protected readonly rules = computed(() =>
    this.pockets().flatMap((pocket) =>
      pocket.wallets.map((w) => ({
        ...w,
        category: pocket.name,
        kind: pocket.kind,
        share: percent(w.sharePercent),
        quota: normalizeDecimal(w.monthlyQuota),
        owed: normalizeDecimal(w.outstanding),
      })),
    ),
  );
  protected readonly totalPercent = computed(() =>
    this.rules().reduce((sum, r) => sum + (Number.isFinite(r.share) ? r.share : 0), 0),
  );
  protected readonly quotasMinor = computed(() =>
    this.rules()
      .filter((r) => r.kind === 'debt' && r.quota)
      .reduce((sum, r) => sum + toMinor(r.quota, 2), 0n),
  );
  protected readonly hasQuotas = computed(() => this.quotasMinor() > 0n);
  protected readonly suggestedCap = computed(() => {
    const quotas = this.quotasMinor();
    const roundTo = 10000n * 100n;
    const wanted = quotas + quotas / 2n;
    const rounded = ((wanted + roundTo - 1n) / roundTo) * roundTo;
    return (Number(rounded > 0n ? rounded : 100000n * 100n) / 100).toLocaleString('es-CO');
  });
  protected readonly monthlyCap = computed(() => (this.capTouched() ? this.customCap() : this.suggestedCap()));

  protected readonly preview = computed(() => {
    const split = previewSplit(
      PREVIEW_SALE,
      this.rules()
        .filter((r) => Number.isFinite(r.share) && r.share > 0)
        .map((r) => ({
          label: r.label.trim() || r.category,
          kind: r.kind,
          shareBps: Math.round(r.share * 100),
          outstandingMinor: r.owed ? toMinor(r.owed, 2) : undefined,
        })),
    );
    const pct = (minor: bigint) => Math.round((Number(minor) * 100) / Number(PREVIEW_SALE));
    return [
      { label: 'Para ti', kind: 'kept' as const, amount: this.peso(split.kept), pct: pct(split.kept) },
      ...split.items.map((item) => ({
        label: item.label,
        kind: item.kind,
        amount: this.peso(item.amount),
        pct: pct(item.amount),
      })),
    ];
  });

  ngOnInit(): void {
    this.title.setTitle('Arma tus bolsillos · MiPlante');
    if (this.api.requireSession()) {
      this.start().catch((err: unknown) => this.error.set((err as Error)?.message || 'No pudimos empezar.'));
    }
  }

  private async start(): Promise<void> {
    const { merchant } = await this.api.get<MeResponse>('/api/auth/me');
    if (merchant) {
      await this.router.navigate(['/merchant'], { queryParams: { id: merchant.id }, replaceUrl: true });
      return;
    }
    const saved = remember.get(STORAGE_KEYS.merchantWallet);
    if (saved) this.businessWallet.set(walletName(saved));
  }

  protected peso(minor: bigint): string {
    return formatMoney(Number(minor) / 100, 'COP');
  }

  protected pesos(raw: string): string {
    const dec = normalizeDecimal(raw);
    return dec ? this.peso(toMinor(dec, 2)) : '—';
  }

  protected isPicked(name: string): boolean {
    return this.pockets().some((p) => p.name === name);
  }

  protected togglePreset(preset: Preset): void {
    this.error.set('');
    if (this.isPicked(preset.name)) {
      this.pockets.update((list) => list.filter((p) => p.name !== preset.name));
    } else if (this.rules().length < MAX_RULES) {
      this.pockets.update((list) => [
        ...list,
        newPocket(preset.name, preset.kind, preset.doodle, preset.hint, preset.share),
      ]);
    }
  }

  protected customPockets(): Pocket[] {
    return this.pockets().filter((p) => !PRESETS.some((preset) => preset.name === p.name));
  }

  protected removePocket(id: number): void {
    this.pockets.update((list) => list.filter((p) => p.id !== id));
  }

  protected addCustomPocket(): void {
    const name = this.customName.trim();
    if (!name) {
      this.error.set('Escribe el nombre del bolsillo, por ejemplo Servicios.');
      return;
    }
    if (this.pockets().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      this.error.set(`Ya tienes el bolsillo «${name}».`);
      return;
    }
    if (this.rules().length >= MAX_RULES) {
      this.error.set(`Puedes tener hasta ${MAX_RULES} billeteras.`);
      return;
    }
    const kind = this.customKind;
    const hint = kind === 'debt' ? 'Con cuota cada mes' : 'Guarda una parte de cada venta';
    this.pockets.update((list) => [...list, newPocket(name, kind, kind === 'debt' ? 'peso' : 'planta', hint, null)]);
    this.customName = '';
    this.error.set('');
  }

  protected updateWallet(pocketId: number, walletId: number, patch: Partial<WalletDraft>): void {
    this.error.set('');
    if ('destination' in patch) this.clearWalletError(walletId);
    this.pockets.update((list) =>
      list.map((p) =>
        p.id !== pocketId
          ? p
          : { ...p, wallets: p.wallets.map((w) => (w.id !== walletId ? w : { ...w, ...patch })) },
      ),
    );
  }

  protected updateMoney(pocketId: number, walletId: number, field: 'monthlyQuota' | 'outstanding', raw: string): void {
    this.updateWallet(pocketId, walletId, { [field]: formatThousandsInput(raw) });
  }

  protected addWallet(pocket: Pocket): void {
    if (this.rules().length >= MAX_RULES) return;
    this.pockets.update((list) =>
      list.map((p) => (p.id !== pocket.id ? p : { ...p, wallets: [...p.wallets, newWallet(p.kind, null)] })),
    );
  }

  private clearWalletError(walletId: number): void {
    if (!this.walletErrors()[walletId]) return;
    this.walletErrors.update(({ [walletId]: _, ...rest }) => rest);
  }

  protected removeWallet(pocket: Pocket, walletId: number): void {
    this.clearWalletError(walletId);
    this.pockets.update((list) =>
      list.map((p) => (p.id !== pocket.id ? p : { ...p, wallets: p.wallets.filter((w) => w.id !== walletId) })),
    );
  }

  protected onWalletInput(value: string): void {
    this.businessWallet.set(value);
    this.checkedWallet.set(null);
    this.walletCheck.set(null);
  }

  protected onCapInput(raw: string): void {
    this.capTouched.set(true);
    this.customCap.set(formatThousandsInput(raw));
  }

  protected back(): void {
    this.error.set('');
    this.step.update((s) => Math.max(0, s - 1));
  }

  protected async advance(): Promise<void> {
    if (this.busy()) return;
    const problem = await this.problemAt(this.stepId());
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.error.set('');
    if (this.stepId() === 'review') {
      await this.authorize();
      return;
    }
    this.step.update((s) => s + 1);
  }

  private async verifyWallet(): Promise<WalletInfo | null> {
    const value = this.businessWallet().trim();
    if (!value) return null;
    this.walletCheck.set({ text: 'Buscando tu billetera…', ok: false });
    try {
      const info = await this.api.checkWallet(value);
      this.checkedWallet.set(info);
      this.walletCheck.set({ text: `✓ Encontramos ${info.name} (${info.currency})`, ok: true });
      return info;
    } catch (err: unknown) {
      this.walletCheck.set(null);
      throw err;
    }
  }

  /** What blocks leaving a step, in the shopkeeper's words; empty when it is fine. */
  private async problemAt(id: string): Promise<string> {
    if (id === 'shop' && !this.businessName.trim()) return 'Escribe el nombre de tu negocio.';
    if (id === 'wallet') {
      if (!this.businessWallet().trim()) return 'Escribe el nombre de tu billetera, por ejemplo mi-tienda.';
      if (this.checkedWallet()) return '';
      this.busy.set(true);
      try {
        await this.verifyWallet();
        return '';
      } catch (err: unknown) {
        return (err as Error)?.message || 'No encontramos esa billetera.';
      } finally {
        this.busy.set(false);
      }
    }
    if (id === 'pick' && !this.pockets().length) return 'Elige al menos un bolsillo.';
    if (id.startsWith('pocket:')) {
      return this.pocketProblem(this.currentPocket()!) || (await this.destinationProblem(this.currentPocket()!));
    }
    if (id.startsWith('quota:')) return this.quotaProblem(this.currentPocket()!);
    if (id === 'cap' || id === 'review') return this.capProblem();
    return '';
  }

  private pocketProblem(pocket: Pocket): string {
    if (!pocket.wallets.length) return `Agrega a quién va la parte de ${pocket.name}.`;
    for (const w of pocket.wallets) {
      const share = percent(w.sharePercent);
      if (!w.label.trim()) return `Ponle un nombre, por ejemplo ${pocket.kind === 'debt' ? 'Distribuidora Central' : 'Fondo de emergencia'}.`;
      if (!w.destination.trim()) return `Escribe la billetera de «${w.label.trim()}».`;
      if (!Number.isFinite(share) || share < 0.01 || share > MAX_TOTAL_PERCENT) {
        return `El porcentaje va de 0,01 a ${MAX_TOTAL_PERCENT}.`;
      }
    }
    const total = this.totalPercent();
    if (total > MAX_TOTAL_PERCENT) {
      return `Entre todos tus bolsillos suman ${total.toLocaleString('es-CO')}%. Lo máximo es ${MAX_TOTAL_PERCENT}%, para que siempre te quede una parte.`;
    }
    return '';
  }

  /** Checks that each destination exists and is not the shop's own wallet. */
  private async destinationProblem(pocket: Pocket): Promise<string> {
    const shopWallet = this.checkedWallet()?.wallet ?? normalizeWallet(this.businessWallet());
    const errors: Record<number, string> = {};
    this.busy.set(true);
    try {
      await Promise.all(
        pocket.wallets.map(async (w) => {
          if (normalizeWallet(w.destination) === shopWallet) {
            errors[w.id] = 'No puede ser la misma billetera de tu negocio.';
            return;
          }
          try {
            await this.api.checkWallet(w.destination);
          } catch (err: unknown) {
            errors[w.id] = (err as Error)?.message || 'No encontramos esta billetera. Revisa que esté bien escrita.';
          }
        }),
      );
    } finally {
      this.busy.set(false);
    }
    this.walletErrors.update((prev) => ({ ...prev, ...errors }));
    const failed = pocket.wallets.filter((w) => errors[w.id]).map((w) => `«${w.label.trim()}»`);
    if (!failed.length) return '';
    return failed.length === 1
      ? `Revisa la billetera de ${failed[0]}: está marcada en rojo.`
      : `Revisa las billeteras de ${failed.join(', ')}: están marcadas en rojo.`;
  }

  private quotaProblem(pocket: Pocket): string {
    for (const w of pocket.wallets) {
      if (!normalizeDecimal(w.monthlyQuota)) return `¿Cuánto le pagas al mes a «${w.label.trim()}»? Por ejemplo 200.000.`;
      const day = Number(w.dueDay);
      if (!Number.isInteger(day) || day < 1 || day > 28) return 'El día de pago va del 1 al 28.';
    }
    return '';
  }

  private capProblem(): string {
    const cap = normalizeDecimal(this.monthlyCap());
    if (!cap) return 'Escribe tu límite del mes, por ejemplo 500.000.';
    const quotas = this.quotasMinor();
    if (toMinor(cap, 2) < quotas) return `Tus cuotas del mes suman ${this.peso(quotas)}: el límite debe ser al menos eso.`;
    return '';
  }

  private async authorize(): Promise<void> {
    this.busy.set(true);
    try {
      const wallet = this.checkedWallet()!.wallet;
      const body = {
        name: this.businessName.trim(),
        wallet,
        monthlyCap: normalizeDecimal(this.monthlyCap()),
        rules: this.rules().map((r) => ({
          label: r.label.trim(),
          category: r.category,
          kind: r.kind,
          destination: normalizeWallet(r.destination),
          sharePercent: r.share,
          ...(r.kind === 'debt' ? { monthlyQuota: r.quota, dueDay: Number(r.dueDay) } : {}),
          ...(r.kind === 'debt' && r.owed ? { outstanding: r.owed } : {}),
        })),
      };
      const { redirectUrl } = await this.api.post<{ redirectUrl: string }>('/api/merchants', body);
      remember.set(STORAGE_KEYS.merchantWallet, wallet);
      window.location.href = redirectUrl;
    } catch (err: unknown) {
      this.error.set((err as Error)?.message || 'No pudimos guardar tu tienda.');
      this.busy.set(false);
    }
  }
}
