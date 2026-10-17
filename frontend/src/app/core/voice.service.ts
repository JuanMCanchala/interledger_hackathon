import { Injectable, signal } from '@angular/core';
import { pesosInWords } from './spoken-amount';
import { afterWakeWord, isEcho } from './wake-word';

const VOICE_KEY = 'miplante.voice';
const HANDS_FREE_KEY = 'miplante.voice.handsFree';

interface RecognitionResult extends ArrayLike<{ transcript: string }> {
  isFinal?: boolean;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { resultIndex?: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onstart?: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

/**
 * Spanish voices that sound like a woman, by the names browsers and systems give them: GlorIA
 * speaks with one when the device has it. Names of male voices are listed to be avoided.
 */
const FEMALE_VOICE =
  /salome|dalia|sabina|helena|laura|elvira|paloma|paulina|m[oó]nica|marisol|lupe|pen[eé]lope|esperanza|camila|valentina|ximena|luc[ií]a|elena|conchita|google español|female|mujer/i;
const MALE_VOICE =
  /gonzalo|jorge|pablo|ra[uú]l|[aá]lvaro|diego|juan|carlos|enrique|miguel|andr[eé]s|tom[aá]s|\bmale\b|hombre/i;

/**
 * The till's voice, all on the device where it can be: it says the payments out loud with a chime
 * and a buzz, reads GlorIA's answers in a woman's voice when there is one, and listens for what the
 * shopkeeper dictates. Hands-free mode keeps listening for "Gloria" (ADR 0017). Every part degrades
 * quietly where the browser cannot do it.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly synth: SpeechSynthesis | undefined =
    typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  private readonly Recognition: RecognitionCtor | undefined =
    typeof window !== 'undefined'
      ? ((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition)
      : undefined;
  private audio: AudioContext | undefined;
  private recognition: SpeechRecognitionLike | undefined;

  // Hands-free: one continuous recognition, started again whenever the browser ends it.
  private wake: SpeechRecognitionLike | undefined;
  private wakeEnded: Promise<void> | undefined;
  private wakeHandler: ((text: string) => void) | undefined;
  private wakePaused = false;
  private wakeListened = false;
  private wakeRetryMs = 300;
  /** While GlorIA speaks, and a moment after, what is heard is her own voice: ignored. */
  private deafUntil = 0;
  private lastSpoken = '';
  private liveTimer: ReturnType<typeof setTimeout> | undefined;

  readonly canSpeak = Boolean(this.synth);
  readonly canListen = Boolean(this.Recognition);
  /** Payments and alerts said out loud; on by default, remembered per device. */
  readonly announcements = signal(readFlag(VOICE_KEY, true));
  readonly listening = signal(false);
  /** Listening all along for "Gloria"; off by default, remembered per device. */
  readonly handsFree = signal(false);
  readonly handsFreeError = signal('');
  /** What hands-free is hearing right now, as it hears it: shown so the shopkeeper sees it works. */
  readonly heardLive = signal('');
  /** Hands-free heard her name, before the phrase is even over. */
  readonly heardName = signal(0);

  setAnnouncements(on: boolean): void {
    this.announcements.set(on);
    writeFlag(VOICE_KEY, on);
    if (on) this.chime();
  }

  /** Whether the shopkeeper left hands-free on, on this device. */
  handsFreeWanted(): boolean {
    return readFlag(HANDS_FREE_KEY, false);
  }

  /** Who gets each phrase heard in hands-free mode (GlorIA's panel). */
  onPhrase(handler: ((text: string) => void) | undefined): void {
    this.wakeHandler = handler;
  }

  setHandsFree(on: boolean): void {
    this.handsFreeError.set('');
    writeFlag(HANDS_FREE_KEY, on);
    if (!on || !this.Recognition) {
      this.handsFree.set(false);
      void this.stopWake();
      return;
    }
    this.handsFree.set(true);
    this.wakeRetryMs = 300;
    this.runWake();
  }

  /** Stops listening without forgetting the choice, e.g. when leaving the till. */
  pauseHandsFree(): void {
    this.handsFree.set(false);
    void this.stopWake();
  }

  /**
   * Says `text` in Colombian Spanish (or the closest Spanish voice, a woman's when there is one),
   * cutting what was being said. Resolves when it is done, so GlorIA can listen right after asking.
   */
  speak(text: string): Promise<void> {
    if (!this.synth || !text) return Promise.resolve();
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.pickVoice();
    utterance.lang = voice?.lang ?? 'es-CO';
    utterance.voice = voice ?? null;
    utterance.rate = 1;
    // Without a woman's voice on the device, a higher pitch still sounds closer to one.
    utterance.pitch = voice && FEMALE_VOICE.test(voice.name) ? 1.05 : 1.25;
    this.deafUntil = Number.POSITIVE_INFINITY;
    this.lastSpoken = text;
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(ceiling);
        this.deafUntil = Date.now() + 700;
        resolve();
      };
      // Some browsers never fire "end": a ceiling from the text's length keeps nothing waiting.
      const ceiling = setTimeout(done, Math.min(20_000, 1500 + text.length * 90));
      utterance.onend = done;
      utterance.onerror = done;
      this.synth!.speak(utterance);
    });
  }

  stopSpeaking(): void {
    this.synth?.cancel();
    this.deafUntil = Math.min(this.deafUntil, Date.now() + 300);
  }

  /** "¡Pago recibido! Veinte mil pesos." with a chime and a buzz, if announcements are on. */
  announcePayment(pesos: number): void {
    if (!this.announcements()) return;
    this.chime();
    buzz();
    void this.speak(`¡Pago recibido! ${pesosInWords(pesos)}.`);
  }

  /** A short notice said out loud (a failed payout, a creditor paid), if announcements are on. */
  announce(text: string, alert = true): void {
    if (!this.announcements()) return;
    this.chime(alert);
    void this.speak(text);
  }

  /** Listens once and resolves with what was said; rejects with a message to show when it cannot. */
  async listen(): Promise<string> {
    if (!this.Recognition) {
      throw new Error('Tu navegador no permite dictar. Escribe el mensaje.');
    }
    this.stopSpeaking();
    this.recognition?.stop();
    // The browser runs one recognition at a time: hands-free steps aside meanwhile.
    this.wakePaused = true;
    await this.stopWake();
    try {
      return await this.listenOnce();
    } finally {
      this.wakePaused = false;
      this.runWake();
    }
  }

  stopListening(): void {
    this.recognition?.stop();
  }

  /** A two-note chime, rising for good news, falling for an alert; made on the device. */
  chime(alert = false): void {
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audio ??= new Ctx();
      const ctx = this.audio;
      void ctx.resume();
      const notes = alert ? [660, 440] : [660, 990];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.14;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.24);
      });
    } catch {
      // No sound on this device: the spoken text and the screen still tell.
    }
  }

  private listenOnce(): Promise<string> {
    const recognition = new this.Recognition!();
    this.recognition = recognition;
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    this.listening.set(true);
    return new Promise((resolve, reject) => {
      let heard = '';
      recognition.onresult = (event) => {
        heard = Array.from(event.results)
          .map((result) => result[0]?.transcript ?? '')
          .join(' ')
          .trim();
      };
      recognition.onerror = (event) => {
        this.listening.set(false);
        reject(new Error(recognitionError(event.error)));
      };
      recognition.onend = () => {
        this.listening.set(false);
        if (heard) resolve(heard);
        else reject(new Error('No te escuché. Toca el micrófono e intenta de nuevo.'));
      };
      try {
        recognition.start();
      } catch {
        this.listening.set(false);
        reject(new Error('No pude abrir el micrófono. Intenta de nuevo.'));
      }
    });
  }

  /** Starts hands-free's continuous recognition and keeps it going. */
  private runWake(): void {
    if (!this.Recognition || !this.handsFree() || this.wakePaused || this.wake) return;
    const recognition = new this.Recognition();
    this.wake = recognition;
    recognition.lang = 'es-CO';
    recognition.continuous = true;
    // Partial results show at once what is heard, and catch her name before the phrase ends.
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    let ended!: () => void;
    this.wakeEnded = new Promise((resolve) => (ended = resolve));
    recognition.onstart = () => {
      this.wakeListened = true;
      this.wakeRetryMs = 100;
    };
    recognition.onresult = (event) => {
      if (Date.now() < this.deafUntil) return;
      let partial = '';
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const options = Array.from(result)
          .map((alt) => alt.transcript.trim())
          .filter(Boolean);
        if (!options.length) continue;
        // Of the readings the browser offers, the one with her name in it.
        const text = options.find((o) => afterWakeWord(o) !== null) ?? options[0]!;
        if (isEcho(text, this.lastSpoken) && Date.now() < this.deafUntil + 2500) continue;
        if (result.isFinal) {
          this.showLive(text);
          this.wakeHandler?.(text);
        } else {
          partial += `${text} `;
        }
      }
      if (partial) {
        this.showLive(partial.trim());
        if (afterWakeWord(partial) !== null) this.heardName.update((n) => n + 1);
      }
    };
    recognition.onerror = (event) => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
        this.handsFreeError.set(recognitionError(event.error));
        this.handsFree.set(false);
      }
    };
    recognition.onend = () => {
      this.wake = undefined;
      ended();
      if (!this.handsFree() || this.wakePaused) return;
      // The browser ends a session after a phrase or a silence: start again at once, so nothing
      // said meanwhile is lost. Only a session that never got to listen waits, a bit longer each time.
      this.wakeRetryMs = this.wakeListened ? 100 : Math.min(this.wakeRetryMs * 2, 3000);
      setTimeout(() => this.runWake(), this.wakeRetryMs);
    };
    try {
      this.wakeListened = false;
      recognition.start();
    } catch {
      this.wake = undefined;
      ended();
    }
  }

  private showLive(text: string): void {
    this.heardLive.set(text);
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => this.heardLive.set(''), 3000);
  }

  private stopWake(): Promise<void> {
    const wake = this.wake;
    if (!wake) return Promise.resolve();
    const ended = this.wakeEnded ?? Promise.resolve();
    (wake.abort ?? wake.stop).call(wake);
    // Never wait long on a browser that does not say it ended.
    return Promise.race([ended, new Promise<void>((resolve) => setTimeout(resolve, 600))]);
  }

  /** A woman's voice before a man's, a Colombian one first, any Spanish one before none. */
  private pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = (this.synth?.getVoices() ?? []).filter((v) => v.lang.toLowerCase().startsWith('es'));
    const score = (v: SpeechSynthesisVoice) => {
      const lang = v.lang.replace('_', '-').toLowerCase();
      let points = 0;
      if (FEMALE_VOICE.test(v.name)) points += 8;
      if (MALE_VOICE.test(v.name)) points -= 8;
      if (lang === 'es-co') points += 4;
      else if (['es-us', 'es-mx', 'es-419'].includes(lang)) points += 2;
      // Edge's natural ("Online") voices sound far better than the local ones.
      if (/online|natural/i.test(v.name)) points += 1;
      return points;
    };
    return voices.sort((a, b) => score(b) - score(a))[0];
  }
}

/** A short buzz, only once the page was touched: browsers refuse it (with a warning) before. */
export function buzz(): void {
  const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (active && !active.hasBeenActive) return;
  navigator.vibrate?.([80, 60, 120]);
}

function recognitionError(error: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return window.isSecureContext
      ? 'Permite el micrófono en tu navegador para hablarle a GlorIA.'
      : 'El micrófono solo funciona con https o en localhost. Abre MiPlante así para hablarle a GlorIA.';
  }
  if (error === 'audio-capture') return 'No encontramos un micrófono en este equipo.';
  if (error === 'no-speech') return 'No te escuché. Toca el micrófono e intenta de nuevo.';
  return 'No pude escucharte. Intenta de nuevo.';
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'on';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Remembering is a convenience: without storage it is on for this visit only.
  }
}
