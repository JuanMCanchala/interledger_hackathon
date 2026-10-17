import { TestBed } from '@angular/core/testing';
import { VoiceService } from './voice.service';

/** Chrome's SpeechRecognition as hands-free sees it: started, fed results, ended at any time. */
class FakeRecognition {
  static all: FakeRecognition[] = [];
  /** A browser that ends each session before it can listen (no network, busy microphone). */
  static failing = false;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  running = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    FakeRecognition.all.push(this);
  }
  start() {
    this.running = true;
    if (FakeRecognition.failing) {
      queueMicrotask(() => this.end());
      return;
    }
    this.onstart?.();
  }
  stop() {
    this.end();
  }
  abort() {
    this.end();
  }
  end() {
    if (!this.running) return;
    this.running = false;
    this.onend?.();
  }
  /** One phrase, with the readings the browser offers for it. */
  say(readings: string[], isFinal = true) {
    const result = Object.assign(
      readings.map((transcript) => ({ transcript })),
      { isFinal },
    );
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  static current() {
    return FakeRecognition.all.filter((r) => r.running).at(-1)!;
  }
}

describe('VoiceService hands-free', () => {
  let voice: VoiceService;
  const heard: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.all = [];
    FakeRecognition.failing = false;
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      constructor(readonly text: string) {}
    };
    heard.length = 0;
    localStorage.clear();
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
    TestBed.resetTestingModule();
    voice = TestBed.inject(VoiceService);
    voice.onPhrase((text) => heard.push(text));
  });

  afterEach(() => {
    voice.setHandsFree(false);
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    vi.useRealTimers();
  });

  it('listens continuously, with partial results, in Colombian Spanish', () => {
    voice.setHandsFree(true);
    const rec = FakeRecognition.current();
    expect(rec).toMatchObject({ lang: 'es-CO', continuous: true, interimResults: true });
    expect(rec.maxAlternatives).toBeGreaterThan(1);
  });

  it('hands over each finished phrase, preferring the reading with her name', () => {
    voice.setHandsFree(true);
    FakeRecognition.current().say(['historia cobra veinte mil', 'Gloria cobra veinte mil']);
    expect(heard).toEqual(['Gloria cobra veinte mil']);
  });

  it('shows what it hears and notices her name before the phrase ends', () => {
    voice.setHandsFree(true);
    const rec = FakeRecognition.current();
    rec.say(['oye glo'], false);
    expect(voice.heardLive()).toBe('oye glo');
    expect(voice.heardName()).toBe(0);
    rec.say(['oye Gloria'], false);
    expect(voice.heardName()).toBe(1);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(3100);
    expect(voice.heardLive()).toBe('');
  });

  it('starts again whenever the browser ends the session, and stops when turned off', () => {
    voice.setHandsFree(true);
    FakeRecognition.current().end();
    vi.advanceTimersByTime(200);
    const second = FakeRecognition.current();
    expect(FakeRecognition.all).toHaveLength(2);
    second.say(['Gloria, ¿cómo voy?']);
    expect(heard).toEqual(['Gloria, ¿cómo voy?']);

    voice.setHandsFree(false);
    vi.advanceTimersByTime(5000);
    expect(FakeRecognition.all.some((r) => r.running)).toBe(false);
    expect(localStorage.getItem('miplante.voice.handsFree')).toBe('off');
  });

  it('keeps retrying, a bit slower each time but never long, while sessions fail', async () => {
    FakeRecognition.failing = true;
    voice.setHandsFree(true);
    await vi.advanceTimersByTimeAsync(20_000);
    const tries = FakeRecognition.all.length;
    // 200, 400, 800, 1600, 3000, 3000…: about ten tries in twenty seconds, not hundreds.
    expect(tries).toBeGreaterThan(6);
    expect(tries).toBeLessThan(15);

    // Once the browser listens again, a session that ends is replaced at once.
    FakeRecognition.failing = false;
    await vi.advanceTimersByTimeAsync(3100);
    const rec = FakeRecognition.current();
    rec.end();
    await vi.advanceTimersByTimeAsync(150);
    expect(FakeRecognition.current()).not.toBe(rec);
  });

  it('does not take her own voice for the shopkeeper', async () => {
    voice.setHandsFree(true);
    const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] };
    Object.assign(voice as unknown as { synth: unknown }, { synth });
    void voice.speak('¿Genero el cobro de veinte mil pesos?');
    FakeRecognition.current().say(['genero el cobro de veinte mil pesos']);
    expect(heard).toEqual([]);
    // She finished: what follows is the shopkeeper again, except her own words coming back.
    const utterance = synth.speak.mock.calls[0]![0] as { onend: () => void };
    utterance.onend();
    vi.advanceTimersByTime(800);
    FakeRecognition.current().say(['el cobro de veinte mil pesos']);
    FakeRecognition.current().say(['sí']);
    expect(heard).toEqual(['sí']);
  });

  it('turns off and says why when the microphone is not allowed', () => {
    voice.setHandsFree(true);
    FakeRecognition.current().onerror?.({ error: 'not-allowed' });
    FakeRecognition.current().end();
    vi.advanceTimersByTime(5000);
    expect(voice.handsFree()).toBe(false);
    expect(voice.handsFreeError()).toMatch(/micrófono/);
    expect(FakeRecognition.all).toHaveLength(1);
  });

  it('steps aside for a one-time dictation and comes back after', async () => {
    voice.setHandsFree(true);
    const listening = voice.listen();
    await vi.advanceTimersByTimeAsync(10);
    const once = FakeRecognition.current();
    expect(once.continuous).toBe(false);
    once.say(['veinte mil de arroz']);
    once.end();
    await expect(listening).resolves.toBe('veinte mil de arroz');
    vi.advanceTimersByTime(10);
    expect(FakeRecognition.current().continuous).toBe(true);
  });
});
