import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import CobroPage from './cobro';

describe('Counter display', () => {
  const sale = (status: string) => ({
    id: 'sale-1',
    amount: { value: '3000000', assetCode: 'COP', assetScale: 2 },
    status,
    createdAt: new Date().toISOString(),
    payUrl: 'https://wallet.test/pay',
    settlement: { status: 'pending', items: [] },
  });
  const replies: unknown[] = [];
  const get = vi.fn(async () => replies.shift() ?? replies.at(-1));

  beforeEach(() => {
    vi.useFakeTimers();
    replies.length = 0;
    get.mockClear();
    TestBed.configureTestingModule({
      imports: [CobroPage],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { get } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ pantalla: 'key-1' }) } },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('waits, then shows each new sale on its own', async () => {
    replies.push(
      { shopName: 'Tienda Rosa', sale: null },
      { shopName: 'Tienda Rosa', sale: sale('open') },
      { shopName: 'Tienda Rosa', sale: sale('paid') },
    );
    const fixture = TestBed.createComponent(CobroPage);
    const root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();

    expect(get).toHaveBeenCalledWith('/api/displays/key-1');
    expect(root.textContent).toContain('Esperando el próximo cobro');
    // The customer never gets a way into the till from here.
    expect(root.textContent).not.toContain('Volver a mi caja');

    await vi.advanceTimersByTimeAsync(2600);
    fixture.detectChanges();
    expect(root.textContent).toContain('30.000');
    expect(root.querySelector('app-qr-code')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(1600);
    fixture.detectChanges();
    expect(root.textContent).toContain('¡Pago recibido!');
  });

  it('says so when the shop changed the link', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404 }));
    const fixture = TestBed.createComponent(CobroPage);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ya no está enlazada');
  });
});
