import { DOCUMENT } from '@angular/common';
import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BeforeInstallPromptEvent,
  PwaInstallService,
  providePwaInstall,
} from './pwa-install.service';

describe('PwaInstallService', () => {
  let media: EventTarget & { matches: boolean };
  let maxTouchPoints = 0;
  const originalTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');

  beforeEach(() => {
    media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    );
    vi.stubGlobal('isSecureContext', true);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Desktop Chrome');
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    maxTouchPoints = 0;
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get: () => maxTouchPoints,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete (navigator as Navigator & { standalone?: boolean }).standalone;
    vi.restoreAllMocks();
    if (originalTouchPoints) {
      Object.defineProperty(navigator, 'maxTouchPoints', originalTouchPoints);
    } else {
      Reflect.deleteProperty(navigator, 'maxTouchPoints');
    }
    vi.unstubAllGlobals();
  });

  function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome }),
    });
    window.dispatchEvent(event);
    return event;
  }

  it('does not offer a non-functional button in an unsupported browser', async () => {
    const service = TestBed.inject(PwaInstallService);
    expect(service.canInstall()).toBe(false);
    expect(service.iosManualInstall()).toBe(false);
    await expect(service.install()).resolves.toBe('unavailable');
  });

  it('captures the event at startup before an install component exists', () => {
    TestBed.configureTestingModule({ providers: [providePwaInstall()] });
    const injector = TestBed.inject(EnvironmentInjector);
    const event = offerInstall();
    const service = injector.get(PwaInstallService);

    expect(event.defaultPrevented).toBe(true);
    expect(service.canInstall()).toBe(true);
    expect(event.prompt).not.toHaveBeenCalled();
  });

  it('prompts only on request, consumes the event once and waits for installation confirmation', async () => {
    const service = TestBed.inject(PwaInstallService);
    const event = offerInstall();

    await expect(service.install()).resolves.toBe('accepted');
    await expect(service.install()).resolves.toBe('unavailable');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(service.canInstall()).toBe(false);
    expect(service.installing()).toBe(false);
    // Accepting the dialog is not proof that the OS completed the installation.
    expect(service.standalone()).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));
    expect(service.standalone()).toBe(true);
  });

  it('does not nag or reuse a dismissed prompt, but accepts a new browser event', async () => {
    const service = TestBed.inject(PwaInstallService);
    const event = offerInstall('dismissed');

    await expect(service.install()).resolves.toBe('dismissed');
    expect(service.canInstall()).toBe(false);
    expect(event.prompt).toHaveBeenCalledTimes(1);

    const next = offerInstall();
    expect(service.canInstall()).toBe(true);
    expect(next.prompt).not.toHaveBeenCalled();
  });

  it('prevents concurrent prompts and clears the busy state after a choice', async () => {
    const service = TestBed.inject(PwaInstallService);
    let choose!: (choice: { outcome: 'dismissed' }) => void;
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: new Promise<{ outcome: 'dismissed' }>((resolve) => (choose = resolve)),
    });
    window.dispatchEvent(event);

    const pending = service.install();
    expect(service.installing()).toBe(true);
    await expect(service.install()).resolves.toBe('unavailable');
    expect(event.prompt).toHaveBeenCalledTimes(1);

    choose({ outcome: 'dismissed' });
    await expect(pending).resolves.toBe('dismissed');
    expect(service.installing()).toBe(false);
  });

  it('handles a rejected native prompt without an unhandled error', async () => {
    const service = TestBed.inject(PwaInstallService);
    const event = offerInstall();
    event.prompt.mockRejectedValueOnce(new Error('NotAllowedError'));

    await expect(service.install()).resolves.toBe('failed');
    expect(service.canInstall()).toBe(false);
    expect(service.installing()).toBe(false);
  });

  it('handles a failed user-choice result and clears the busy state', async () => {
    const service = TestBed.inject(PwaInstallService);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      get userChoice(): BeforeInstallPromptEvent['userChoice'] {
        return Promise.reject(new Error('Installation unavailable'));
      },
    });
    window.dispatchEvent(event);

    await expect(service.install()).resolves.toBe('failed');
    expect(service.installing()).toBe(false);
  });

  it('does not offer installation in an already installed standalone window', () => {
    media.matches = true;
    const service = TestBed.inject(PwaInstallService);
    offerInstall();

    expect(service.standalone()).toBe(true);
    expect(service.canInstall()).toBe(false);
    expect(service.iosManualInstall()).toBe(false);
  });

  it('reacts to standalone display changes and discards an obsolete prompt', async () => {
    const service = TestBed.inject(PwaInstallService);
    const event = offerInstall();
    media.matches = true;
    media.dispatchEvent(new Event('change'));

    expect(service.standalone()).toBe(true);
    await expect(service.install()).resolves.toBe('unavailable');
    expect(event.prompt).not.toHaveBeenCalled();

    media.matches = false;
    media.dispatchEvent(new Event('change'));
    expect(service.standalone()).toBe(false);
    expect(service.canInstall()).toBe(false);
  });

  it('offers manual Safari instructions on iPhone without a native prompt', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone) AppleWebKit Safari',
    );
    const service = TestBed.inject(PwaInstallService);

    expect(service.iosManualInstall()).toBe(true);
    expect(service.canInstall()).toBe(false);
    window.dispatchEvent(new Event('appinstalled'));
    expect(service.iosManualInstall()).toBe(false);
  });

  it('recognizes iPads that use a desktop user agent', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    maxTouchPoints = 5;

    expect(TestBed.inject(PwaInstallService).iosManualInstall()).toBe(true);
  });

  it('recognizes the iOS standalone flag', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    const service = TestBed.inject(PwaInstallService);

    expect(service.standalone()).toBe(true);
    expect(service.iosManualInstall()).toBe(false);
  });

  it('does not suggest installing from an insecure iOS origin', () => {
    vi.stubGlobal('isSecureContext', false);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');

    expect(TestBed.inject(PwaInstallService).iosManualInstall()).toBe(false);
  });

  it('works without matchMedia support', () => {
    vi.stubGlobal('matchMedia', undefined);
    const service = TestBed.inject(PwaInstallService);
    offerInstall();

    expect(service.canInstall()).toBe(true);
  });

  it('does not access browser APIs when there is no browser window', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: null } }],
    });
    const service = TestBed.inject(PwaInstallService);

    expect(service.canInstall()).toBe(false);
    expect(service.iosManualInstall()).toBe(false);
    await expect(service.install()).resolves.toBe('unavailable');
  });

  it('removes window and media listeners when the injector is destroyed', () => {
    const service = TestBed.inject(PwaInstallService);
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeMedia = vi.spyOn(media, 'removeEventListener');
    TestBed.resetTestingModule();

    expect(removeWindow).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('appinstalled', expect.any(Function));
    expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function));
    offerInstall();
    expect(service.canInstall()).toBe(false);
  });
});
