import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PwaInstallService } from '../../core/pwa-install.service';
import { SiteHeader } from './site-layout';

describe('SiteHeader installation opt-in', () => {
  it('keeps checkout headers unchanged and shows installation only when requested', () => {
    TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [
        provideRouter([]),
        {
          provide: PwaInstallService,
          useValue: {
            standalone: signal(false),
            canInstall: signal(true),
            installing: signal(false),
            iosManualInstall: signal(false),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SiteHeader);
    const root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(root.querySelector('app-install-app')).toBeNull();

    fixture.componentRef.setInput('showInstall', true);
    fixture.detectChanges();
    expect(root.querySelector('app-install-app button')?.textContent).toContain(
      'Instalar MiPlante',
    );
  });
});
