import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  viewChild,
} from '@angular/core';

declare global {
  interface Window {
    QRCode?: {
      new (
        el: HTMLElement,
        options: {
          text: string;
          width: number;
          height: number;
          colorDark: string;
          colorLight: string;
          correctLevel: number;
        },
      ): unknown;
      CorrectLevel: { M: number };
    };
  }
}

@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:load)': 'renderQr()' },
  template: `<div #box aria-hidden="true"></div>`,
})
export class QrCode implements AfterViewInit {
  readonly value = input.required<string>();
  readonly size = input<number>(256);
  readonly fallback = input<string>('Comparte el enlace de abajo.');

  private readonly box = viewChild.required<ElementRef<HTMLDivElement>>('box');
  private viewReady = false;

  constructor() {
    effect(() => {
      const _val = this.value();
      const _sz = this.size();
      if (this.viewReady) {
        this.renderQr();
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderQr();
  }

  protected renderQr(): void {
    const target = this.box()?.nativeElement;
    const url = this.value();
    const size = this.size();
    const fallback = this.fallback();
    if (!target) return;

    target.replaceChildren();
    if (!url) return;

    if (typeof window.QRCode !== 'function') {
      const p = document.createElement('p');
      p.className = 'small';
      p.textContent = fallback;
      target.append(p);
      return;
    }

    try {
      new window.QRCode(target, {
        text: url,
        width: size,
        height: size,
        colorDark: '#0e1410',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    } catch {
      const p = document.createElement('p');
      p.className = 'small';
      p.textContent = fallback;
      target.replaceChildren(p);
    }
  }
}
