import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { PwaInstallService } from '../../core/pwa-install.service';
import AuthPage from './auth';

describe('Guided authentication with PWA installation', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
  });

  afterEach(() => vi.unstubAllGlobals());

  function setup(mode: 'login' | 'register') {
    const post = vi.fn();
    const install = vi.fn(async () => 'accepted');
    TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { token: () => '', post } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { mode }, queryParamMap: convertToParamMap({}) } },
        },
        {
          provide: PwaInstallService,
          useValue: {
            standalone: signal(false),
            canInstall: signal(true),
            installing: signal(false),
            iosManualInstall: signal(false),
            install,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AuthPage);
    const root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    return { fixture, root, post, install };
  }

  it.each(['login', 'register'] as const)(
    'keeps the new %s layout and installs without submitting authentication',
    async (mode) => {
      const { fixture, root, post, install } = setup(mode);
      expect(root.querySelector(mode === 'register' ? 'app-wizard' : '.flow-login')).not.toBeNull();
      expect(root.querySelector('app-plant')?.getAttribute('data-stage')).toBe(
        mode === 'register' ? 'seed' : 'bloom',
      );
      const button = root.querySelector<HTMLButtonElement>('.flow-aside app-install-app button')!;
      expect(button.textContent).toContain('Instalar MiPlante');
      button.click();
      await fixture.whenStable();
      expect(install).toHaveBeenCalledTimes(1);
      expect(post).not.toHaveBeenCalled();
    },
  );

  it('advances the registration wizard and plant without losing the install action', async () => {
    const { fixture, root, post } = setup('register');
    const name = root.querySelector<HTMLInputElement>('#auth-name')!;
    name.value = 'Nelly Restrepo';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    root
      .querySelector('app-wizard form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(root.querySelector('#auth-email')).not.toBeNull();
    expect(root.querySelector('app-plant')?.getAttribute('data-stage')).toBe('sprout');
    expect(root.querySelector('app-install-app button')).not.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
