import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import { VoiceService } from '../../core/voice.service';
import { ChargeRequest, Gloria, GloriaSection, afterWakeWord } from './gloria';

@Component({
  imports: [Gloria],
  template: `<app-gloria
    merchantId="shop-1"
    shopName="Tienda Rosa"
    [charge]="charge"
    [cashSale]="cashSale"
    [cashDeposit]="cashDeposit"
    (openSection)="sections.push($event)"
  />`,
})
class Host {
  readonly sales: ChargeRequest[] = [];
  readonly sections: GloriaSection[] = [];
  problem: string | null = null;
  readonly charge = async (sale: ChargeRequest) => {
    if (!this.problem) this.sales.push(sale);
    return this.problem;
  };
  readonly cashSales: ChargeRequest[] = [];
  readonly deposits: number[] = [];
  readonly cashSale = async (sale: ChargeRequest) => {
    this.cashSales.push(sale);
    return null;
  };
  readonly cashDeposit = async (amount: number) => {
    this.deposits.push(amount);
    return { ok: true, text: `Consignación de ${amount} registrada. No queda nada por consignar.` };
  };
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
    root.querySelector<HTMLButtonElement>('.launcher')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, root };
  }

  it('greets, answers a suggestion and sends only the real conversation', async () => {
    answers.set([{ reply: 'Llevas $ 10.000 este mes.', actions: [] }]);
    const { fixture, root } = await openChat();

    expect(root.querySelector('[role="dialog"]')).toBeTruthy();
    expect(root.textContent).toContain('Soy GlorIA');
    root.querySelector<HTMLButtonElement>('.suggestions .chip')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(post).toHaveBeenCalledWith('/api/merchants/shop-1/assistant', {
      messages: [{ role: 'user', content: '¿Cómo voy este mes?' }],
    });
    expect(root.textContent).toContain('Llevas $ 10.000 este mes.');
    // Suggestions give way once the conversation starts.
    expect(root.querySelector('.suggestions')).toBeNull();
  });

  const saleAnswer = {
    reply: 'Listo, te preparo el cobro de $ 20.000.',
    actions: [
      { type: 'sale', amount: '20000', description: 'Arroz' },
      { type: 'open', section: 'vender' },
    ],
  };

  async function type(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }, root: HTMLElement, text: string) {
    const input = root.querySelector<HTMLInputElement>('#gloria-message')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector<HTMLFormElement>('form.field')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('charges at once when asked, without the model', async () => {
    const { fixture, root } = await openChat();
    await type(fixture, root, 'Por favor haz un cobre $50,000');
    expect(post).not.toHaveBeenCalled();
    expect(fixture.componentInstance.sales).toEqual([{ amount: 50000, description: '' }]);
    expect(root.querySelector('.peek')!.textContent).toContain('Cobro de $ 50.000');
  });

  it('charges what the model understood as a charge', async () => {
    answers.set([saleAnswer]);
    const { fixture, root } = await openChat();
    await type(fixture, root, 'necesito que le cobres al cliente lo del arroz, veinte mil');
    expect(post).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.sales).toEqual([{ amount: 20000, description: 'Arroz' }]);
    expect(root.querySelector('.peek')!.textContent).toContain('Cobro de $ 20.000 por Arroz');
  });

  it('records cash sales and deposits, never as a QR charge, without the model', async () => {
    const { fixture, root } = await openChat();
    await type(fixture, root, 'vendí 15 mil de pan en efectivo');
    expect(fixture.componentInstance.cashSales).toEqual([{ amount: 15000, description: 'pan' }]);
    expect(root.textContent).toContain('Registré la venta en efectivo');
    await type(fixture, root, 'cobra 20 mil en efectivo');
    expect(fixture.componentInstance.cashSales).toHaveLength(2);
    expect(fixture.componentInstance.sales).toEqual([]);
    await type(fixture, root, 'ya consigné 3.000');
    expect(fixture.componentInstance.deposits).toEqual([3000]);
    expect(root.textContent).toContain('No queda nada por consignar');
    expect(post).not.toHaveBeenCalled();
  });

  it('carries out the cash actions the model understood', async () => {
    answers.set([
      {
        reply: 'Listo.',
        actions: [
          { type: 'cash-sale', amount: '8000', description: 'huevos' },
          { type: 'cash-deposit', amount: '1200' },
        ],
      },
    ]);
    const { fixture, root } = await openChat();
    await type(fixture, root, 'el señor me dio ocho mil por los huevos y metí mil doscientos a la billetera');
    expect(fixture.componentInstance.cashSales).toEqual([{ amount: 8000, description: 'huevos' }]);
    expect(fixture.componentInstance.deposits).toEqual([1200]);
  });

  it('never charges again for an earlier message', async () => {
    answers.set([
      saleAnswer,
      // The model wrongly acting again on the earlier charge, for a question with no amount.
      saleAnswer,
    ]);
    const { fixture, root } = await openChat();
    await type(fixture, root, 'necesito que le cobres al cliente lo del arroz, veinte mil');
    root.querySelector<HTMLButtonElement>('.launcher')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await type(fixture, root, 'cómo van mis ventas el día de hoy');

    expect(fixture.componentInstance.sales).toHaveLength(1);
    // The model is told the first charge was done: a request with its answer.
    const sent = (post.mock.calls[1] as unknown[])[1] as { messages: { role: string; content: string }[] };
    expect(sent.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent.messages[1]!.content).toContain('Generé el cobro');
    expect(root.textContent).toContain('necesito el monto');
  });

  it('tells the model what the till did on its own', async () => {
    answers.set([{ reply: 'Vas muy bien.', actions: [] }]);
    const { fixture, root } = await openChat();
    await type(fixture, root, 'generame un cobro por $50,000');
    expect(fixture.componentInstance.sales).toEqual([{ amount: 50000, description: '' }]);
    root.querySelector<HTMLButtonElement>('.launcher')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await type(fixture, root, 'cómo van mis ventas el día de hoy');
    const sent = (post.mock.calls[0] as unknown[])[1] as { messages: { role: string; content: string }[] };
    expect(sent.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(fixture.componentInstance.sales).toHaveLength(1);
  });

  it('says why when the till cannot charge', async () => {
    const { fixture, root } = await openChat();
    fixture.componentInstance.problem = 'primero autoriza tu billetera en Inicio para poder cobrar.';
    await type(fixture, root, 'cobra 10.000');
    expect(root.textContent).toContain('No pude generar el cobro de $ 10.000: primero autoriza');
    expect(root.textContent).not.toContain('Generé');
  });

  it('goes to a section the model opens, and steps aside', async () => {
    answers.set([{ reply: 'Te llevo a Avisos.', actions: [{ type: 'open', section: 'avisos' }] }]);
    const { fixture, root } = await openChat();
    await type(fixture, root, '¿qué pasó con mis pagos?');
    expect(fixture.componentInstance.sections).toEqual(['avisos']);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('.peek')!.textContent).toContain('Te llevo a Avisos');
  });

  it('goes where asked without the model, even when the model only says it did', async () => {
    const { fixture, root } = await openChat();
    await type(fixture, root, 'Ya ven inicio');
    expect(post).not.toHaveBeenCalled();
    expect(fixture.componentInstance.sections).toEqual(['inicio']);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('.peek')!.textContent).toContain('te llevé a Inicio');

    // The model claims it opened a section but asks the till for nothing: the till goes anyway.
    answers.set([{ reply: 'Ahí tienes Ajustes abierto para que cambies tu meta.', actions: [] }]);
    root.querySelector<HTMLButtonElement>('.launcher')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await type(fixture, root, 'quiero cambiar mi meta de ventas del mes');
    expect(fixture.componentInstance.sections).toEqual(['inicio', 'ajustes']);
  });

  it('steps aside after charging, and says what it did by the launcher', async () => {
    const { fixture, root } = await openChat();
    await type(fixture, root, 'cobra 50.000');
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('.peek')!.textContent).toContain('50.000');
    root.querySelector<HTMLButtonElement>('.peek-body')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')).toBeTruthy();
    expect(root.textContent).toContain('Generé el cobro');
  });

  it('in hands-free mode, answers only when called', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // What the till's continuous recognition would hand over, phrase by phrase.
    const hear = async (text: string) => {
      (TestBed.inject(VoiceService) as unknown as { wakeHandler(t: string): void }).wakeHandler(text);
      await fixture.whenStable();
      fixture.detectChanges();
    };

    await hear('son cinco mil, vecino');
    expect(fixture.componentInstance.sales).toEqual([]);
    expect(root.querySelector('[role="dialog"]')).toBeNull();

    await hear('Oye Gloria, cobra veinte mil de arroz');
    expect(fixture.componentInstance.sales).toEqual([{ amount: 20000, description: 'arroz' }]);

    // "Gloria" alone wakes her: the next phrase is for her, without her name.
    await hear('Gloria');
    await hear('cobra cinco mil');
    expect(fixture.componentInstance.sales).toHaveLength(2);
    await hear('cobra mil');
    expect(fixture.componentInstance.sales).toHaveLength(2);
  });

  it('says kindly when it cannot answer', async () => {
    post.mockRejectedValueOnce(new Error('network'));
    const { fixture, root } = await openChat();
    root.querySelector<HTMLButtonElement>('.suggestions .chip')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('No pude responderte');
  });
});

describe('afterWakeWord', () => {
  it('finds what follows her name', () => {
    expect(afterWakeWord('Gloria, cobra veinte mil')).toBe('cobra veinte mil');
    expect(afterWakeWord('oye gloria ¿cómo voy?')).toBe('¿cómo voy?');
    expect(afterWakeWord('Gloria')).toBe('');
    expect(afterWakeWord('son cinco mil')).toBeNull();
    // How recognition often writes her name.
    expect(afterWakeWord('Glorias cuánto vendí')).toBe('cuánto vendí');
    expect(afterWakeWord('loria, cobra diez mil')).toBe('cobra diez mil');
    expect(afterWakeWord('Gloría')).toBe('');
    expect(afterWakeWord('una historia')).toBeNull();
    expect(afterWakeWord('la gloria de dios')).toBe('de dios');
  });
});
