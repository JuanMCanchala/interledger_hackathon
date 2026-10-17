import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';

type InstallOutcome = 'accepted' | 'dismissed';
type InstallResult = InstallOutcome | 'unavailable' | 'failed';

/** Chromium's deferred install event; it is not available in every browser. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: InstallOutcome }>;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly browser = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly displayMode = this.browser?.matchMedia?.('(display-mode: standalone)');
  private readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);
  private readonly standaloneState = signal(this.isStandalone());
  private readonly installingState = signal(false);
  private readonly ios = this.isIos();

  readonly standalone = this.standaloneState.asReadonly();
  readonly installing = this.installingState.asReadonly();
  readonly canInstall = computed(() => !this.standalone() && this.deferredPrompt() !== null);
  readonly iosManualInstall = computed(
    () =>
      this.ios &&
      this.browser?.isSecureContext === true &&
      !this.standalone() &&
      !this.canInstall(),
  );

  constructor() {
    const browser = this.browser;
    if (!browser) return;

    const onPrompt = (event: Event) => {
      if (this.standalone()) return;
      event.preventDefault();
      this.deferredPrompt.set(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      this.deferredPrompt.set(null);
      this.standaloneState.set(true);
    };
    const onDisplayMode = () => {
      this.standaloneState.set(this.isStandalone());
      if (this.standalone()) this.deferredPrompt.set(null);
    };

    browser.addEventListener('beforeinstallprompt', onPrompt);
    browser.addEventListener('appinstalled', onInstalled);
    this.displayMode?.addEventListener('change', onDisplayMode);
    this.destroyRef.onDestroy(() => {
      browser.removeEventListener('beforeinstallprompt', onPrompt);
      browser.removeEventListener('appinstalled', onInstalled);
      this.displayMode?.removeEventListener('change', onDisplayMode);
    });
  }

  /** Call only from a user gesture. Each browser event can be used once, even after dismissal. */
  async install(): Promise<InstallResult> {
    const event = this.deferredPrompt();
    if (!event || this.installing() || this.standalone()) return 'unavailable';

    this.deferredPrompt.set(null);
    this.installingState.set(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome;
    } catch {
      return 'failed';
    } finally {
      this.installingState.set(false);
    }
  }

  private isStandalone(): boolean {
    const navigator = this.browser?.navigator as (Navigator & { standalone?: boolean }) | undefined;
    return this.displayMode?.matches === true || navigator?.standalone === true;
  }

  private isIos(): boolean {
    const navigator = this.browser?.navigator;
    if (!navigator) return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }
}

/** Capture the event at startup, before a lazy route renders an install button. */
export function providePwaInstall() {
  return provideEnvironmentInitializer(() => {
    inject(PwaInstallService);
  });
}
