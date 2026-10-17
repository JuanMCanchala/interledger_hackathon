import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, ApiService } from '../../core/api.service';
import { VoiceService } from '../../core/voice.service';
import { Doodle } from '../../shared/brand/doodle';

/** What GlorIA prepared for the shopkeeper to confirm (backend/src/assistant/gloriaService.ts). */
export type GloriaAction =
  | { type: 'sale'; amount: string; description?: string }
  | { type: 'open'; section: GloriaSection };

export type GloriaSection = 'inicio' | 'vender' | 'metas' | 'repartos' | 'ajustes' | 'avisos';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  actions?: GloriaAction[];
  /** A local message (the greeting, an error): shown, never sent to the model. */
  local?: boolean;
}

const SPEAK_KEY = 'miplante.gloria.speak';
const HISTORY_LIMIT = 24;
const SECTION_LABEL: Record<GloriaSection, string> = {
  inicio: 'Inicio',
  vender: 'Vender',
  metas: 'Metas',
  repartos: 'Repartos',
  ajustes: 'Ajustes',
  avisos: 'Avisos',
};
const SUGGESTIONS = [
  '¿Cómo voy este mes?',
  '¿Cuánto me falta para pagarle a mis proveedores?',
  'Cobra 10.000',
  '¿Tengo pagos por revisar?',
  '¿Qué es la ganancia real?',
];

/**
 * GlorIA, the shopkeeper's assistant (ADR 0017): a chat that answers about the shop from its own
 * figures, by text or by voice. What she prepares (a sale, a section to open) shows as buttons the
 * shopkeeper taps: she never charges nor pays on her own.
 */
@Component({
  selector: 'app-gloria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Doodle],
  template: `
    @if (!open()) {
      <button
        #launcher
        type="button"
        class="gloria-launcher"
        (click)="openPanel()"
        aria-haspopup="dialog"
        aria-label="Hablar con GlorIA, tu asistente"
      >
        <span class="launcher-mark" aria-hidden="true"><app-doodle name="planta" /></span>
        <span class="launcher-text">GlorIA</span>
      </button>
    } @else {
      <div class="gloria-backdrop" (click)="closePanel()" aria-hidden="true"></div>
      <section
        class="gloria-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gloria-title"
        (keydown.escape)="closePanel()"
      >
        <header class="gloria-head">
          <span class="avatar" aria-hidden="true"><app-doodle name="planta" /></span>
          <div class="who">
            <h2 id="gloria-title">GlorIA</h2>
            <p>Tu asistente de {{ shopName() || 'la tienda' }}</p>
          </div>
          @if (voice.canSpeak) {
            <button
              type="button"
              class="icon-button"
              [attr.aria-pressed]="speakReplies()"
              [attr.aria-label]="speakReplies() ? 'Dejar de leer las respuestas' : 'Leer las respuestas en voz alta'"
              [title]="speakReplies() ? 'Respuestas en voz alta: sí' : 'Respuestas en voz alta: no'"
              (click)="toggleSpeak()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9z" />
                @if (speakReplies()) {
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
                } @else {
                  <path d="M17 9l5 6M22 9l-5 6" />
                }
              </svg>
            </button>
          }
          <button type="button" class="icon-button" aria-label="Cerrar a GlorIA" (click)="closePanel()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <ol class="gloria-thread" #thread aria-live="polite" aria-label="Conversación con GlorIA">
          @for (turn of turns(); track $index) {
            <li class="bubble" [class.is-user]="turn.role === 'user'" [class.is-local]="turn.local">
              <p>{{ turn.content }}</p>
              @if (turn.actions?.length) {
                <div class="bubble-actions">
                  @for (action of turn.actions; track $index) {
                    @if (action.type === 'sale') {
                      <button type="button" class="btn btn-lima" (click)="takeSale(action)">
                        Cobrar {{ pesos(action.amount) }}
                      </button>
                    } @else {
                      <button type="button" class="btn btn-ghost-light" (click)="takeOpen(action.section)">
                        Ir a {{ sectionLabel(action.section) }} →
                      </button>
                    }
                  }
                </div>
              }
            </li>
          }
          @if (thinking()) {
            <li class="bubble is-typing" aria-label="GlorIA está escribiendo">
              <span></span><span></span><span></span>
            </li>
          }
        </ol>

        @if (onlyGreeting()) {
          <div class="gloria-suggestions" aria-label="Preguntas sugeridas">
            @for (s of suggestions; track s) {
              <button type="button" class="chip-button" (click)="send(s)">{{ s }}</button>
            }
          </div>
        }

        <form class="gloria-input" (ngSubmit)="send(draft())">
          @if (voice.canListen) {
            <button
              type="button"
              class="mic"
              [class.is-listening]="voice.listening()"
              [attr.aria-pressed]="voice.listening()"
              [attr.aria-label]="voice.listening() ? 'Dejar de escuchar' : 'Hablarle a GlorIA'"
              (click)="dictate()"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          }
          <label class="sr-only" for="gloria-message">Escríbele a GlorIA</label>
          <input
            #field
            id="gloria-message"
            name="message"
            autocomplete="off"
            maxlength="1000"
            [placeholder]="voice.listening() ? 'Te escucho…' : 'Pregúntale algo a GlorIA'"
            [ngModel]="draft()"
            (ngModelChange)="draft.set($event)"
            [disabled]="thinking()"
          />
          <button
            type="submit"
            class="send"
            aria-label="Enviar"
            [disabled]="thinking() || !draft().trim()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
          </button>
        </form>
        <p class="gloria-note">GlorIA te ayuda con tu tienda; nunca cobra ni paga sin tu toque.</p>
      </section>
    }
  `,
  styles: [
    `
      :host {
        --gloria-gap: 12px;
      }
      .gloria-launcher {
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: calc(92px + env(safe-area-inset-bottom));
        z-index: 40;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-height: 56px;
        padding: 0 20px 0 8px;
        border: 0;
        border-radius: 999px;
        background: var(--lima);
        color: var(--monte);
        font: 700 1rem/1 var(--sans);
        box-shadow: 0 18px 40px -16px rgb(0 0 0 / 70%), inset 0 0 0 2px rgb(9 70 65 / 12%);
        cursor: pointer;
        transition: transform 0.2s ease;
      }
      .gloria-launcher:hover {
        transform: translateY(-2px);
      }
      .gloria-launcher:active {
        transform: translateY(1px) scale(0.98);
      }
      .launcher-mark {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--monte);
        color: var(--lima);
      }
      .launcher-mark app-doodle {
        width: 26px;
      }
      @media (min-width: 900px) {
        .gloria-launcher {
          bottom: max(24px, env(safe-area-inset-bottom));
        }
      }

      .gloria-backdrop {
        position: fixed;
        inset: 0;
        z-index: 49;
        background: rgb(6 51 47 / 55%);
      }
      .gloria-panel {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: grid;
        grid-template-rows: auto 1fr auto auto auto;
        background: var(--monte-hondo) url(/paper.png);
        color: var(--papel);
        padding: max(12px, env(safe-area-inset-top)) 0 max(10px, env(safe-area-inset-bottom));
        animation: gloria-in 0.22s ease-out;
      }
      @media (min-width: 700px) {
        .gloria-panel {
          inset: auto 24px 24px auto;
          width: min(420px, calc(100vw - 48px));
          height: min(680px, calc(100vh - 48px));
          border-radius: var(--radius-lg);
          box-shadow: 0 40px 80px -30px rgb(0 0 0 / 70%), 0 0 0 1px rgb(204 241 55 / 25%);
          overflow: hidden;
        }
      }
      @keyframes gloria-in {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
      }

      .gloria-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 16px 14px;
        border-bottom: 1px solid rgb(253 251 251 / 10%);
      }
      .avatar {
        display: grid;
        place-items: center;
        flex: none;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: var(--lima);
        color: var(--monte);
      }
      .avatar app-doodle {
        width: 28px;
      }
      .who {
        flex: 1;
        min-width: 0;
      }
      .who h2 {
        margin: 0;
        font: 700 1.3rem/1.1 var(--sans);
      }
      .who p {
        margin: 2px 0 0;
        font: 400 0.95rem/1.3 var(--script);
        color: rgb(253 251 251 / 72%);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .icon-button {
        display: grid;
        place-items: center;
        flex: none;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 50%;
        background: rgb(253 251 251 / 8%);
        color: var(--papel);
        cursor: pointer;
      }
      .icon-button[aria-pressed='true'] {
        background: var(--lima);
        color: var(--monte);
      }
      svg {
        width: 22px;
        height: 22px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .gloria-thread {
        display: flex;
        flex-direction: column;
        gap: var(--gloria-gap);
        margin: 0;
        padding: 16px;
        overflow-y: auto;
        list-style: none;
        overscroll-behavior: contain;
      }
      .bubble {
        max-width: 88%;
        padding: 12px 14px;
        border-radius: 18px 18px 18px 6px;
        background: var(--monte-claro);
        box-shadow: inset 0 0 0 1px rgb(253 251 251 / 8%);
        font-size: 1.02rem;
        line-height: 1.5;
      }
      .bubble p {
        margin: 0;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .bubble.is-user {
        align-self: flex-end;
        border-radius: 18px 18px 6px 18px;
        background: var(--lima);
        color: var(--monte);
        font-weight: 600;
      }
      .bubble.is-local {
        background: rgb(253 251 251 / 6%);
      }
      .bubble-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .bubble-actions .btn {
        min-height: 44px;
      }
      .btn-ghost-light {
        background: transparent;
        color: var(--lima);
        box-shadow: inset 0 0 0 2px var(--lima);
      }
      .is-typing {
        display: inline-flex;
        gap: 6px;
        width: max-content;
      }
      .is-typing span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--lima);
        animation: gloria-dot 1s ease-in-out infinite;
      }
      .is-typing span:nth-child(2) {
        animation-delay: 0.15s;
      }
      .is-typing span:nth-child(3) {
        animation-delay: 0.3s;
      }
      @keyframes gloria-dot {
        50% {
          opacity: 0.3;
          transform: translateY(-3px);
        }
      }

      .gloria-suggestions {
        display: flex;
        gap: 8px;
        padding: 0 16px 12px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .gloria-suggestions .chip-button {
        flex: none;
        min-height: 44px;
        white-space: nowrap;
      }

      .gloria-input {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 12px;
        padding: 6px;
        border-radius: 999px;
        background: rgb(253 251 251 / 10%);
        box-shadow: inset 0 0 0 1px rgb(253 251 251 / 14%);
      }
      .gloria-input input {
        flex: 1;
        min-width: 0;
        min-height: 44px;
        border: 0;
        background: transparent;
        color: var(--papel);
        font: 400 1.05rem/1.2 var(--sans);
        padding: 0 6px;
      }
      .gloria-input input::placeholder {
        color: rgb(253 251 251 / 55%);
      }
      .gloria-input input:focus {
        outline: none;
      }
      .gloria-input:focus-within {
        box-shadow: 0 0 0 3px var(--lima);
      }
      .mic,
      .send {
        display: grid;
        place-items: center;
        flex: none;
        width: 48px;
        height: 48px;
        border: 0;
        border-radius: 50%;
        cursor: pointer;
      }
      .mic {
        background: rgb(253 251 251 / 12%);
        color: var(--papel);
      }
      .mic.is-listening {
        background: var(--lima);
        color: var(--monte);
        animation: gloria-pulse 1.2s ease-in-out infinite;
      }
      @keyframes gloria-pulse {
        50% {
          box-shadow: 0 0 0 10px rgb(204 241 55 / 0%);
        }
        0%,
        100% {
          box-shadow: 0 0 0 0 rgb(204 241 55 / 45%);
        }
      }
      .send {
        background: var(--lima);
        color: var(--monte);
      }
      .send:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .gloria-note {
        margin: 8px 16px 0;
        text-align: center;
        font-size: 0.8rem;
        color: rgb(253 251 251 / 60%);
      }
      @media (prefers-reduced-motion: reduce) {
        .gloria-panel,
        .is-typing span,
        .mic.is-listening {
          animation: none;
        }
        .gloria-launcher {
          transition: none;
        }
      }
    `,
  ],
})
export class Gloria {
  readonly merchantId = input.required<string>();
  readonly shopName = input<string>('');
  /** A sale GlorIA prepared, for the till to fill in so the shopkeeper confirms it. */
  readonly prepareSale = output<{ amount: number; description: string }>();
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
  protected readonly onlyGreeting = computed(() => this.turns().every((t) => t.local));

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
  }

  protected openPanel(): void {
    this.open.set(true);
    queueMicrotask(() => this.field()?.nativeElement.focus());
  }

  protected closePanel(): void {
    this.voice.stopListening();
    this.voice.stopSpeaking();
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
        },
      );
      this.turns.update((t) => [
        ...t,
        { role: 'assistant', content: answer.reply, actions: answer.actions },
      ]);
      if (spoken || this.speakReplies()) this.voice.speak(answer.reply);
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

  protected takeSale(action: Extract<GloriaAction, { type: 'sale' }>): void {
    this.prepareSale.emit({ amount: Number(action.amount), description: action.description ?? '' });
    this.closePanel();
  }

  protected takeOpen(section: GloriaSection): void {
    this.openSection.emit(section);
    this.closePanel();
  }

  protected pesos(amount: string): string {
    return `$ ${Number(amount).toLocaleString('es-CO')}`;
  }

  protected sectionLabel(section: GloriaSection): string {
    return SECTION_LABEL[section];
  }

  /** A message from GlorIA that is not an answer of the model (an error, the greeting). */
  private say(content: string, local: boolean): void {
    this.turns.update((t) => [...t, { role: 'assistant', content, local }]);
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
          '¡Hola! Soy GlorIA 🌱 Te ayudo con tu tienda: cómo vas, cuánto tienes apartado para cada proveedor, cuándo se paga y más. También puedo prepararte un cobro. Escríbeme o toca el micrófono y háblame.',
      },
    ];
  }
}

function readSpeak(): boolean {
  try {
    return localStorage.getItem(SPEAK_KEY) === 'on';
  } catch {
    return false;
  }
}
