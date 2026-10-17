import { Injectable, signal } from '@angular/core';
import { pesosInWords } from './spoken-amount';

const VOICE_KEY = 'miplante.voice';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

/**
 * The till's voice, all on the device (no data, no cost): it says the payments out loud with a
 * chime and a buzz, reads GlorIA's answers, and listens for what the shopkeeper dictates. Every
 * part degrades quietly where the browser cannot do it.
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

  readonly canSpeak = Boolean(this.synth);
  readonly canListen = Boolean(this.Recognition);
  /** Payments and alerts said out loud; on by default, remembered per device. */
  readonly announcements = signal(readFlag(VOICE_KEY, true));
  readonly listening = signal(false);

  setAnnouncements(on: boolean): void {
    this.announcements.set(on);
    writeFlag(VOICE_KEY, on);
    if (on) this.chime();
  }

  /** Says `text` in Colombian Spanish (or the closest Spanish voice), cutting what was being said. */
  speak(text: string): void {
    if (!this.synth || !text) return;
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-CO';
    utterance.voice = this.pickVoice() ?? null;
    utterance.rate = 1;
    utterance.pitch = 1.05;
    this.synth.speak(utterance);
  }

  stopSpeaking(): void {
    this.synth?.cancel();
  }

  /** "¡Pago recibido! Veinte mil pesos." with a chime and a buzz, if announcements are on. */
  announcePayment(pesos: number): void {
    if (!this.announcements()) return;
    this.chime();
    navigator.vibrate?.([80, 60, 120]);
    this.speak(`¡Pago recibido! ${pesosInWords(pesos)}.`);
  }

  /** A short notice said out loud (a failed payout, a creditor paid), if announcements are on. */
  announce(text: string, alert = true): void {
    if (!this.announcements()) return;
    this.chime(alert);
    this.speak(text);
  }

  /** Listens once and resolves with what was said; rejects with a message to show when it cannot. */
  listen(): Promise<string> {
    if (!this.Recognition) {
      return Promise.reject(new Error('Tu navegador no permite dictar. Escribe el mensaje.'));
    }
    this.stopSpeaking();
    this.recognition?.stop();
    const recognition = new this.Recognition();
    this.recognition = recognition;
    recognition.lang = 'es-CO';
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
        reject(
          new Error(
            event.error === 'not-allowed' || event.error === 'service-not-allowed'
              ? 'Permite el micrófono en tu navegador para dictar.'
              : event.error === 'no-speech'
                ? 'No te escuché. Toca el micrófono e intenta de nuevo.'
                : 'No pude escucharte. Intenta de nuevo.',
          ),
        );
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

  private pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.synth?.getVoices() ?? [];
    return (
      voices.find((v) => v.lang === 'es-CO') ??
      voices.find((v) => v.lang === 'es-US' || v.lang === 'es-MX' || v.lang === 'es-419') ??
      voices.find((v) => v.lang.startsWith('es'))
    );
  }
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
