import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PwaInstallService } from '../../core/pwa-install.service';
import { InstallApp } from './install-app';

describe('InstallApp', () => {
  function setup() {
    const pwa = {
      standalone: signal(false),
      canInstall: signal(false),
      installing: signal(false),
      iosManualInstall: signal(false),
      install: vi.fn(async (): Promise<'accepted' | 'dismissed' | 'failed'> => 'accepted'),
    };
    TestBed.configureTestingModule({
      imports: [InstallApp],
      providers: [{ provide: PwaInstallService, useValue: pwa }],
    });
    const fixture = TestBed.createComponent(InstallApp);
    const root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    return { pwa, fixture, root };
  }

  it('renders no action without installation support', () => {
    const { root, pwa } = setup();

    expect(root.querySelector('button, details')).toBeNull();
    expect(root.classList.contains('has-install-action')).toBe(false);
    expect(pwa.install).not.toHaveBeenCalled();
  });

  it('waits for a button click instead of prompting automatically', async () => {
    const { pwa, fixture, root } = setup();
    pwa.canInstall.set(true);
    fixture.detectChanges();
    const button = root.querySelector('button')!;

    expect(button.textContent).toContain('Instalar MiPlante');
    expect(button.type).toBe('button');
    expect(pwa.install).not.toHaveBeenCalled();
    button.click();
    await fixture.whenStable();
    expect(pwa.install).toHaveBeenCalledTimes(1);
  });

  it('disables the action and announces that a prompt is in progress', () => {
    const { pwa, fixture, root } = setup();
    pwa.installing.set(true);
    fixture.detectChanges();
    const button = root.querySelector('button')!;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('Instalando');
  });

  it('keeps iOS instructions collapsed until the user asks', () => {
    const { pwa, fixture, root } = setup();
    pwa.iosManualInstall.set(true);
    fixture.detectChanges();
    const details = root.querySelector('details')!;

    expect(details.open).toBe(false);
    expect(root.querySelector('button')).toBeNull();
    root.querySelector('summary')!.click();
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('Safari');
    expect(details.textContent).toContain('Compartir');
    expect(details.textContent).toContain('Añadir a pantalla de inicio');
    expect(pwa.install).not.toHaveBeenCalled();
  });

  it('hides every install control in standalone mode', () => {
    const { pwa, fixture, root } = setup();
    pwa.canInstall.set(true);
    pwa.iosManualInstall.set(true);
    pwa.standalone.set(true);
    fixture.detectChanges();

    expect(root.querySelector('button, details')).toBeNull();
    expect(root.classList.contains('has-install-action')).toBe(false);
  });

  it('does not show an error after the user dismisses the prompt', async () => {
    const { pwa, fixture, root } = setup();
    pwa.canInstall.set(true);
    pwa.install.mockResolvedValueOnce('dismissed');
    fixture.detectChanges();
    root.querySelector('button')!.click();
    await fixture.whenStable();

    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it('offers a non-blocking fallback when the browser cannot open installation', async () => {
    const { pwa, fixture, root } = setup();
    pwa.canInstall.set(true);
    pwa.install.mockResolvedValueOnce('failed');
    fixture.detectChanges();
    root.querySelector('button')!.click();
    await fixture.whenStable();

    expect(root.querySelector('[role="status"]')?.textContent).toContain('menú de tu navegador');
    expect(root.textContent).toContain('Puedes seguir usando MiPlante aquí');

    pwa.standalone.set(true);
    fixture.detectChanges();
    expect(root.querySelector('[role="status"]')).toBeNull();
  });
});
