import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MeResponse, WalletInfo } from './miplante.models';
import {
  CURRENCY_NAMES,
  STORAGE_KEYS,
  normalizeWallet,
  remember,
  walletName,
} from './miplante.utils';

const FRIENDLY_ERRORS: readonly [RegExp, string][] = [
  [
    /Could not get wallet address|wallet desconocida|Wallet address inválida/i,
    'No encontramos esa billetera. Revisa que el nombre esté bien escrito.',
  ],
  [
    /no está permitido/i,
    'Esa billetera no es de la red de prueba de Interledger. Escribe solo su nombre, por ejemplo mi-tienda.',
  ],
  [
    /debe usar https|query ni fragmento/i,
    'Escribe solo el nombre de la billetera, por ejemplo mi-tienda.',
  ],
  [
    /misma wallet del negocio/i,
    'El dinero de un pago automático no puede ir a la misma billetera de tu negocio.',
  ],
  [
    /como máximo pueden tomar el 99%/i,
    'Entre todos los repartos no pueden pasar del 99% de cada venta: siempre te debe quedar una parte.',
  ],
  [
    /ya se está pagando o ya fue pagada/i,
    'Este cobro ya se está pagando. Espera un momento y recarga la página.',
  ],
  [
    /Open Payments rechazó la solicitud/i,
    'La billetera no aceptó la operación. Intenta de nuevo en un momento.',
  ],
];

function friendlyError(message: string): string {
  const match = FRIENDLY_ERRORS.find(([pattern]) => pattern.test(message));
  return match ? match[1] : '';
}

function friendlyStatus(status: number): string {
  if (status === 404) return 'No encontramos lo que buscas';
  if (status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento';
  return `Algo salió mal (error ${status})`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly technical: string,
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly router = inject(Router);

  token(): string {
    return remember.get(STORAGE_KEYS.session);
  }

  startSession(token: string): void {
    remember.set(STORAGE_KEYS.session, token);
  }

  clearSession(): void {
    remember.remove(STORAGE_KEYS.session);
  }

  requireSession(): boolean {
    if (this.token()) return true;
    this.goToLogin();
    return false;
  }

  goToLogin(): void {
    if (window.location.pathname.startsWith('/login')) return;
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    this.router.navigate(['/login'], { queryParams: { next: here } });
  }

  async logout(): Promise<void> {
    try {
      await this.post('/api/auth/logout', {});
    } catch {
      // Signing out on this device is what matters.
    }
    this.clearSession();
    await this.router.navigate(['/login']);
  }

  async homeOfSignedIn(): Promise<string> {
    const { merchant } = await this.get<MeResponse>('/api/auth/me');
    return merchant ? `/merchant?id=${encodeURIComponent(merchant.id)}` : '/onboard';
  }

  async destinationAfterSignIn(next?: string): Promise<string> {
    const home = await this.homeOfSignedIn();
    if (!next) return home;
    const wanted = new URL(next, window.location.origin);
    if (wanted.pathname.replace(/\/$/, '') !== '/merchant') return next;
    const ownId = new URL(home, window.location.origin).searchParams.get('id');
    const wantedId = wanted.searchParams.get('id');
    if (ownId && (!wantedId || wantedId === ownId)) {
      return `/merchant?id=${encodeURIComponent(ownId)}${wanted.hash}`;
    }
    return home;
  }

  async checkWallet(input: string): Promise<WalletInfo> {
    const wallet = normalizeWallet(input);
    const info = await this.get<{ id: string; assetCode: string }>(
      `/api/wallet-address?url=${encodeURIComponent(wallet)}`,
    );
    return {
      wallet,
      name: walletName(info.id),
      currency: CURRENCY_NAMES[info.assetCode] || info.assetCode,
      assetCode: info.assetCode,
    };
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.token();
    const sendToken = Boolean(token) && !/^\/api\/auth\/(login|register)$/.test(path);
    let res: Response;
    try {
      res = await fetch(path, {
        ...options,
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(sendToken ? { authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new ApiError(
        'No hay conexión con MiPlante. Revisa tu internet e intenta de nuevo.',
        0,
        'network_error',
      );
    }

    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && sendToken) {
      this.clearSession();
      this.goToLogin();
    }
    if (!res.ok) {
      const details = Array.isArray(body.details)
        ? body.details.join(' · ')
        : body.details || '';
      const message = body.error || friendlyStatus(res.status);
      const technical = details ? `${message}: ${details}` : message;
      throw new ApiError(friendlyError(technical) || technical, res.status, technical);
    }
    return body as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}
