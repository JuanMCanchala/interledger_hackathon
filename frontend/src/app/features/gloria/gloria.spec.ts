import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import { Gloria, GloriaSection } from './gloria';

@Component({
  imports: [Gloria],
  template: `<app-gloria
    merchantId="shop-1"
    shopName="Tienda Rosa"
    (prepareSale)="sales.push($event)"
    (openSection)="sections.push($event)"
  />`,
})
class Host {
  readonly sales: { amount: number; description: string }[] = [];
  readonly sections: GloriaSection[] = [];
}

describe('GlorIA chat', () => {
  const answers = signal<unknown[]>([]);
  const post = vi.fn(async () => answers().shift());

  beforeEach(() => {
    sessionStorage.clear();
    post.mockClear();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: ApiService, useValue: { post } }],
    });
  });

  async function openChat() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.gloria-launcher')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, root };
  }

  it('greets, answers a suggestion and sends only the real conversation', async () => {
    answers.set([{ reply: 'Llevas $ 10.000 este mes.', actions: [] }]);
    const { fixture, root } = await openChat();

    expect(root.querySelector('[role="dialog"]')).toBeTruthy();
    expect(root.textContent).toContain('Soy GlorIA');
    root.querySelector<HTMLButtonElement>('.gloria-suggestions .chip-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(post).toHaveBeenCalledWith('/api/merchants/shop-1/assistant', {
      messages: [{ role: 'user', content: '¿Cómo voy este mes?' }],
    });
    expect(root.textContent).toContain('Llevas $ 10.000 este mes.');
    // Suggestions give way once the conversation starts.
    expect(root.querySelector('.gloria-suggestions')).toBeNull();
  });

  it('hands a prepared sale to the till instead of charging', async () => {
    answers.set([
      {
        reply: 'Listo, confírmalo en Vender.',
        actions: [
          { type: 'sale', amount: '20000', description: 'Arroz' },
          { type: 'open', section: 'vender' },
        ],
      },
    ]);
    const { fixture, root } = await openChat();
    const input = root.querySelector<HTMLInputElement>('#gloria-message')!;
    input.value = 'cobra veinte mil de arroz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector<HTMLFormElement>('.gloria-input')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    const charge = [...root.querySelectorAll<HTMLButtonElement>('.bubble-actions button')].find((b) =>
      b.textContent!.includes('Cobrar'),
    )!;
    expect(charge.textContent).toContain('20.000');
    charge.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.sales).toEqual([{ amount: 20000, description: 'Arroz' }]);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('says kindly when it cannot answer', async () => {
    post.mockRejectedValueOnce(new Error('network'));
    const { fixture, root } = await openChat();
    root.querySelector<HTMLButtonElement>('.gloria-suggestions .chip-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('No pude responderte');
  });
});
