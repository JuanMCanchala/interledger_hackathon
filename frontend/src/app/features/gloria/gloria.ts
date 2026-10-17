import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, ApiService } from '../../core/api.service';
import {
  parseCashSale,
  parseChargeRequest,
  parseDeposit,
  parseSpokenSale,
  pesosInWords,
} from '../../core/spoken-amount';
import { VoiceService } from '../../core/voice.service';
import { afterWakeWord } from '../../core/wake-word';
import { SECTION_LABEL, parseNavigation, wentTo } from '../../core/navigation-intent';
import { GloriaIcon } from '../../shared/brand/gloria-icon';

/** What GlorIA prepared for the shopkeeper to confirm (backend/src/assistant/gloriaService.ts). */
export type GloriaAction =
  | { type: 'sale'; amount: string; description?: string }
  | { type: 'cash-sale'; amount: string; description?: string }
  | { type: 'cash-deposit'; amount: string }
  | { type: 'open'; section: GloriaSection };

export type GloriaSection = 'inicio' | 'vender' | 'metas' | 'repartos' | 'ajustes' | 'avisos';

type SaleAction = Extract<GloriaAction, { type: 'sale' }>;

export interface ChargeRequest {
  amount: number;
  description: string;
}

export { afterWakeWord };

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  actions?: GloriaAction[];
  /** A local message (the greeting, an error): shown, never sent to the model. */
  local?: boolean;
}

const SPEAK_KEY = 'miplante.gloria.speak';
const HISTORY_LIMIT = 24;
const SUGGESTIONS = [
  '¿Cómo voy este mes?',
  '¿Cuánto me falta para pagarle a mis proveedores?',
  'Cobra 10.000',
  '¿Tengo pagos por revisar?',
  '¿Qué es la ganancia real?',
];

/**
 * GlorIA, the shopkeeper's assistant (ADR 0017): a chat that answers about the shop from its own
 * figures, by text or by voice. Asked to charge, she generates the sale's QR at once (a QR only
 * asks the customer to pay); she never pays nor moves the shop's money.
 */
@Component({
  selector: 'app-gloria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, GloriaIcon],
  templateUrl: './gloria.html',
  styleUrl: './gloria.scss',
})
export class Gloria {
  readonly merchantId = input.required<string>();
  readonly shopName = input<string>('');
  /** The section of the till on screen, so GlorIA knows what the shopkeeper is looking at. */
  readonly section = input<GloriaSection | null>(null);
  /**
   * Generates a sale's QR in the till, as if the shopkeeper had tapped "Generar QR". Resolves with
   * what went wrong, or null once the QR is on screen.
   */
  readonly charge = input.required<(sale: ChargeRequest) => Promise<string | null>>();
  /** Records a sale paid in cash (ADR 0019); resolves with what went wrong, or null. */
  readonly cashSale = input.required<(sale: ChargeRequest) => Promise<string | null>>();
  /** Records cash deposited into the wallet; resolves with what it did, to say back. */
  readonly cashDeposit = input.required<(amount: number) => Promise<{ ok: boolean; text: string }>>();
  /** A section GlorIA takes the shopkeeper to, right away. */
  readonly openSection = output<GloriaSection>();

  protected readonly voice = inject(VoiceService);
  private readonly api = inject(ApiService);
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly launcher = viewChild<ElementRef<HTMLButtonElement>>('launcher');

  protected readonly suggestions = SUGGESTIONS;
  protected readonly open = signal(false);
  protected readonly draft = signal('');
  protected readonly thinking = signal(false);
  protected readonly speakReplies = signal(readSpeak());
  protected readonly turns = signal<Turn[]>([]);
  /** Hands-free: after "Gloria" alone, or a question of hers, the next phrase is for her. */
  protected readonly awake = signal(false);
  private awakeTimer: ReturnType<typeof setTimeout> | undefined;
  /** What she just did, shown for a moment by the launcher once the chat steps aside. */
  protected readonly peek = signal('');
  private peekTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly onlyGreeting = computed(() => this.turns().every((t) => t.local));
  protected readonly statusText = computed(() => {
    if (this.voice.listening() || this.awake()) return 'Te escucho…';
    if (this.thinking()) return 'Trabajando…';
    if (this.voice.handsFree()) return 'Manos libres · di «Gloria»';
    return `Asistente de ${this.shopName() || 'tu tienda'}`;
  });
  /** What the microphone is hearing, while it is listening. */
  protected readonly liveText = computed(() =>
    this.voice.handsFree() || this.voice.listening() ? this.voice.heardLive() : '',
  );

  constructor() {
    // The conversation survives moving between tabs and reloads, for this visit only.
    effect(() => {
      const id = this.merchantId();
      if (!this.turns().length) this.turns.set(this.restore(id));
    });
    effect(() => {
      const turns = this.turns();
      try {
        sessionStorage.setItem(this.storageKey(), JSON.stringify(turns.slice(-HISTORY_LIMIT)));
      } catch {
        // Without storage the chat starts over on reload: nothing else is lost.
      }
      queueMicrotask(() => {
        const el = this.thread()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });

    // Hands-free: every phrase the till hears comes here; only those for GlorIA get an answer.
    this.voice.onPhrase((text) => this.heard(text));
    // Her name in a partial result: she shows she is listening before the phrase is over.
    let namesSeen = this.voice.heardName();
    effect(() => {
      const names = this.voice.heardName();
      if (names === namesSeen) return;
      namesSeen = names;
      untracked(() => this.wakeUp());
    });
    if (this.voice.handsFreeWanted()) this.voice.setHandsFree(true);
    inject(DestroyRef).onDestroy(() => {
      this.voice.onPhrase(undefined);
      // Leaving the till stops listening but keeps the choice: it starts again next time.
      this.voice.pauseHandsFree();
      clearTimeout(this.awakeTimer);
      clearTimeout(this.peekTimer);
    });
  }

  protected toggleHandsFree(): void {
    const on = !this.voice.handsFree();
    this.voice.setHandsFree(on);
    if (on) void this.voice.speak('Listo. Cuando me necesites, di Gloria.');
  }

  /**
   * A phrase heard in hands-free mode. "Gloria, cobra veinte mil" is a request; "Gloria" alone
   * wakes her for the next phrase. Anything else is the shop's own conversation: she stays quiet.
   */
  private heard(text: string): void {
    const request = afterWakeWord(text);
    if (request === null && !this.awake()) return;
    const command = request ?? text;
    this.setAwake(false);
    if (!this.open()) this.openPanel();
    if (!command) {
      // A chime, not words: she would talk over what the shopkeeper says next.
      this.wakeUp();
      return;
    }
    void this.send(command, true);
  }

  /** Heard her name: a chime the first time, and she listens to the next phrase. */
  private wakeUp(): void {
    if (!this.awake()) this.voice.chime();
    this.setAwake(true);
  }

  /** Awake: the next phrase goes to GlorIA without saying her name, for a few seconds. */
  private setAwake(on: boolean): void {
    clearTimeout(this.awakeTimer);
    this.awake.set(on);
    if (on) this.awakeTimer = setTimeout(() => this.awake.set(false), AWAKE_MS);
  }

  protected openPanel(): void {
    this.dismissPeek();
    this.open.set(true);
    queueMicrotask(() => this.field()?.nativeElement.focus());
  }

  protected closePanel(): void {
    this.voice.stopSpeaking();
    this.hidePanel();
  }

  /** Steps aside so the till shows, letting GlorIA finish what she is saying. */
  private hidePanel(): void {
    this.voice.stopListening();
    this.open.set(false);
    queueMicrotask(() => this.launcher()?.nativeElement.focus());
  }

  protected toggleSpeak(): void {
    const next = !this.speakReplies();
    this.speakReplies.set(next);
    try {
      localStorage.setItem(SPEAK_KEY, next ? 'on' : 'off');
    } catch {
      // Remembered for this visit only.
    }
    if (!next) this.voice.stopSpeaking();
  }

  /** Listens to the shopkeeper and sends what they said; a spoken question gets a spoken answer. */
  protected async dictate(): Promise<void> {
    if (this.voice.listening()) {
      this.voice.stopListening();
      return;
    }
    try {
      const heard = await this.voice.listen();
      await this.send(heard, true);
    } catch (error) {
      this.say(error instanceof Error ? error.message : 'No pude escucharte.', true);
    }
  }

  protected async send(text: string, spoken = false): Promise<void> {
    const content = text.trim();
    if (!content || this.thinking()) return;
    this.draft.set('');
    const speakIt = spoken || this.speakReplies();

    // "Consigné 50 mil" and "vendí 15 mil en efectivo" (ADR 0019): read here too, and first, so a
    // cash sale is never taken for a QR charge.
    const deposited = parseDeposit(content);
    if (deposited) {
      this.turns.update((t) => [...t, { role: 'user', content }]);
      await this.depositNow(deposited, speakIt);
      return;
    }
    const cash = parseCashSale(content);
    if (cash) {
      this.turns.update((t) => [...t, { role: 'user', content }]);
      await this.cashNow(cash, speakIt);
      return;
    }

    // "Cobra 50.000", "haz un cobro de $50,000": charged here and now, without the model, so a
    // charge never depends on how the model reads it.
    const request = parseChargeRequest(content);
    if (request) {
      this.turns.update((t) => [...t, { role: 'user', content }]);
      await this.chargeNow(request, speakIt);
      return;
    }
    // "Llévame a inicio", "avisos": the same, for moving around the till.
    const place = parseNavigation(content);
    if (place) {
      this.turns.update((t) => [...t, { role: 'user', content }]);
      this.goTo(place, true, speakIt);
      return;
    }

    this.turns.update((t) => [...t, { role: 'user', content }]);
    this.thinking.set(true);
    try {
      const answer = await this.api.post<{ reply: string; actions: GloriaAction[] }>(
        `/api/merchants/${encodeURIComponent(this.merchantId())}/assistant`,
        {
          messages: this.turns()
            .filter((t) => !t.local)
            .slice(-HISTORY_LIMIT)
            .map(({ role, content: c }) => ({ role, content: c })),
          ...(this.section() && { section: this.section() }),
        },
      );
      const cashSale = answer.actions.find((a) => a.type === 'cash-sale');
      const cashDeposit = answer.actions.find((a) => a.type === 'cash-deposit');
      const charges = answer.actions.some((a) => a.type === 'sale') || cashSale || cashDeposit;
      // Money is only recorded for a message that says how much: a charge the model takes from
      // earlier in the conversation, or makes up, never runs.
      if (charges && !parseSpokenSale(content)) {
        const ask = 'Para eso necesito el monto. Dímelo así: «cobra 20.000» o «vendí 15 mil en efectivo».';
        this.say(ask, false);
        if (speakIt) void this.voice.speak(ask);
        return;
      }
      if (cashSale || cashDeposit) {
        if (cashSale) {
          await this.cashNow(
            { amount: Number(cashSale.amount), description: cashSale.description ?? '' },
            speakIt,
          );
        }
        if (cashDeposit) await this.depositNow(Number(cashDeposit.amount), speakIt);
        return;
      }
      const sale = answer.actions.find((a): a is SaleAction => a.type === 'sale');
      // A section she opened, or one she says she opened without asking the till to.
      const section = answer.actions.find((a) => a.type === 'open')?.section ?? wentTo(answer.reply);
      if (sale) {
        // The model understood a charge: it is generated now, and she says how it went.
        await this.chargeNow({ amount: Number(sale.amount), description: sale.description ?? '' }, speakIt);
        return;
      }
      this.turns.update((t) => [...t, { role: 'assistant', content: money(answer.reply) }]);
      if (section) {
        this.goTo(section, false, false);
        this.showPeek(answer.reply);
      }
      if (speakIt) {
        void this.voice.speak(answer.reply).then(() => {
          if (this.voice.handsFree() && answer.reply.trim().endsWith('?')) this.setAwake(true);
        });
      }
    } catch (error) {
      this.say(
        error instanceof ApiError ? error.message : 'No pude responderte. Intenta de nuevo en un momento.',
        true,
      );
    } finally {
      this.thinking.set(false);
      queueMicrotask(() => this.field()?.nativeElement.focus());
    }
  }

  /** Generates the sale's QR in the till and says so, or says plainly why it could not. */
  private async chargeNow(request: ChargeRequest, speakIt: boolean): Promise<void> {
    this.thinking.set(true);
    let problem: string | null;
    try {
      problem = await this.charge()(request);
    } catch (error) {
      problem = error instanceof Error ? error.message : 'No pude generar el cobro.';
    } finally {
      this.thinking.set(false);
    }
    const amount = `$\u00a0${request.amount.toLocaleString('es-CO')}`;
    if (problem) {
      this.say(`No pude generar el cobro de ${amount}: ${problem}`, false);
      if (speakIt) void this.voice.speak(`No pude generar el cobro. ${problem}`);
      return;
    }
    const note = request.description ? ` por ${request.description}` : '';
    this.say(`¡Listo! Generé el cobro de ${amount}${note}. El código QR ya está en pantalla para tu cliente.`, false);
    if (speakIt) void this.voice.speak(`Listo, el cobro de ${pesosInWords(request.amount)} está en pantalla.`);
    // The chat steps aside so the QR is what shows.
    this.hidePanel();
    this.showPeek(`Cobro de ${amount}${note} listo: el QR está en pantalla.`);
  }

  /** Records a cash sale in the till and says so; its shares wait in cash for a deposit. */
  private async cashNow(request: ChargeRequest, speakIt: boolean): Promise<void> {
    this.thinking.set(true);
    let problem: string | null;
    try {
      problem = await this.cashSale()(request);
    } catch (error) {
      problem = error instanceof Error ? error.message : 'No pude registrar la venta.';
    } finally {
      this.thinking.set(false);
    }
    const amount = `$\u00a0${request.amount.toLocaleString('es-CO')}`;
    if (problem) {
      this.say(`No pude registrar la venta en efectivo de ${amount}: ${problem}`, false);
      if (speakIt) void this.voice.speak(`No pude registrar la venta en efectivo. ${problem}`);
      return;
    }
    const note = request.description ? ` por ${request.description}` : '';
    this.say(
      `¡Listo! Registré la venta en efectivo de ${amount}${note}. Sus repartos quedan por consignar: cuando lo consignes, dime «consigné» y el monto.`,
      true,
    );
    if (speakIt) void this.voice.speak(`Listo, registré la venta en efectivo de ${pesosInWords(request.amount)}.`);
  }

  /** Records a cash deposit in the till and says what it released. */
  private async depositNow(amount: number, speakIt: boolean): Promise<void> {
    this.thinking.set(true);
    let result: { ok: boolean; text: string };
    try {
      result = await this.cashDeposit()(amount);
    } catch (error) {
      result = { ok: false, text: error instanceof Error ? error.message : 'No pude registrar la consignación.' };
    } finally {
      this.thinking.set(false);
    }
    this.say(result.text, false);
    if (speakIt) {
      void this.voice.speak(
        result.ok ? `Listo, registré la consignación de ${pesosInWords(amount)}.` : result.text,
      );
    }
  }

  /**
   * Takes the shopkeeper to the section, and the chat steps aside so it shows; `announce` says so
   * when nobody else did (out loud too with `speakIt`).
   */
  private goTo(section: GloriaSection, announce: boolean, speakIt: boolean): void {
    this.openSection.emit(section);
    this.hidePanel();
    if (!announce) return;
    const text = `Listo, te llevé a ${SECTION_LABEL[section]}.`;
    this.say(text, false);
    this.showPeek(text);
    if (speakIt) void this.voice.speak(text);
  }

  /** A short note by the launcher, so the shopkeeper sees what she did with the chat closed. */
  private showPeek(text: string): void {
    clearTimeout(this.peekTimer);
    this.peek.set(money(text));
    this.peekTimer = setTimeout(() => this.peek.set(''), PEEK_MS);
  }

  protected dismissPeek(): void {
    clearTimeout(this.peekTimer);
    this.peek.set('');
  }

  /**
   * A message from GlorIA written by the till. `local` ones (the greeting, the model being down) are
   * never sent to the model; the rest are her answer to what was asked, so the model knows it is
   * done and never does it again.
   */
  private say(content: string, local: boolean): void {
    this.turns.update((t) => [...t, { role: 'assistant', content: money(content), local }]);
  }

  private storageKey(): string {
    return `miplante.gloria.${this.merchantId()}`;
  }

  private restore(id: string): Turn[] {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`miplante.gloria.${id}`) || '[]') as Turn[];
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {
      // A damaged saved chat just starts over.
    }
    return [
      {
        role: 'assistant',
        local: true,
        content:
          '¡Hola! Soy GlorIA 🌱 Te ayudo con tu tienda: cómo vas, cuánto tienes apartado para cada proveedor, cuándo se paga y más. Dime «cobra 20.000» y genero el cobro al instante. Escríbeme o toca el micrófono y háblame.',
      },
    ];
  }
}

/** How long "Gloria" alone keeps her listening, and how long a note shows by the launcher. */
const AWAKE_MS = 8000;
const PEEK_MS = 6000;

/** "$ 50.000" never breaks between the sign and the figure. */
function money(text: string): string {
  return text.replace(/\$ (?=\d)/g, '$\u00a0');
}

function readSpeak(): boolean {
  try {
    return localStorage.getItem(SPEAK_KEY) === 'on';
  } catch {
    return false;
  }
}
