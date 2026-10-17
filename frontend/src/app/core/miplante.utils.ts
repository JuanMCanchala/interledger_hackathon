import { DestroyRef } from '@angular/core';
import { Amount, StatusInfo, Tone } from './miplante.models';

export const STORAGE_KEYS = {
  session: 'miplante.session',
  merchantWallet: 'miplante.merchantWallet',
  customerWallet: 'miplante.customerWallet',
  seenNotices: 'miplante.seenNotices',
} as const;

export const PAYMENT_STEPS: readonly [string, string][] = [
  ['request', 'Solicitud de pago'],
  ['authorization', 'Autorización'],
  ['execution', 'Ejecución'],
  ['completion', 'Finalización'],
];

export const MERCHANT_STATUS: Record<string, StatusInfo> = {
  'awaiting-consent': { text: 'Falta autorizar', tone: 'wait' },
  active: { text: 'Activo', tone: 'ok' },
  rejected: { text: 'Sin autorizar', tone: 'bad' },
  revoked: { text: 'Autorización cancelada', tone: 'bad' },
  failed: { text: 'No se pudo activar', tone: 'bad' },
};

export const SALE_STATUS: Record<string, StatusInfo> = {
  open: { text: 'Esperando al cliente', tone: 'info' },
  'awaiting-consent': { text: 'Cliente autorizando', tone: 'wait' },
  processing: { text: 'Pago en camino', tone: 'wait' },
  paid: { text: '¡Pagado!', tone: 'ok' },
  failed: { text: 'Pago fallido', tone: 'bad' },
};

export const CUSTOMER_STATUS: Record<string, StatusInfo> = {
  open: { text: 'Listo para pagar', tone: 'info' },
  'awaiting-consent': { text: 'Esperando tu autorización', tone: 'wait' },
  processing: { text: 'Procesando el pago', tone: 'wait' },
  paid: { text: 'Pagado', tone: 'ok' },
  failed: { text: 'No se completó', tone: 'bad' },
};

export const ITEM_STATUS: Record<string, StatusInfo> = {
  processing: { text: 'Enviando…', tone: 'wait' },
  completed: { text: 'Enviado', tone: 'ok' },
  failed: { text: 'Falló', tone: 'bad' },
  skipped: { text: 'Límite mensual alcanzado', tone: 'neutral' },
  reserved: { text: 'Apartado', tone: 'info' },
};

export const PAYOUT_STATUS: Record<string, StatusInfo> = {
  processing: { text: 'Enviando…', tone: 'wait' },
  completed: { text: 'Pagado', tone: 'ok' },
  failed: { text: 'Falló', tone: 'bad' },
};

export const RULE_KIND: Record<string, string> = {
  debt: 'Obligación',
  savings: 'Ahorro',
};

export const MAX_RULES = 10;
export const MAX_TOTAL_PERCENT = 99;
export const WALLET_HOST = 'ilp.interledger-test.dev';

export const CURRENCY_NAMES: Record<string, string> = {
  COP: 'pesos colombianos',
  USD: 'dólares',
  EUR: 'euros',
};

export function badgeClass(tone?: Tone): string {
  const map: Record<string, string> = {
    ok: 'badge badge-ok',
    wait: 'badge badge-wait',
    bad: 'badge badge-bad',
    info: 'badge badge-info',
  };
  return (tone && map[tone]) || 'badge';
}

export function statusInfo(map: Record<string, StatusInfo>, status: string): StatusInfo {
  return map[status] || { text: status, tone: 'neutral' };
}

export function normalizeWallet(input: string | null | undefined): string {
  const text = String(input ?? '').replace(/\s+/g, '');
  if (!text) return '';
  if (/^(\$|https?:\/\/)/i.test(text)) return text;
  if (text.includes('/')) return `$${text}`;
  return `$${WALLET_HOST}/${text.replace(/^@/, '')}`;
}

export function walletName(url: string | null | undefined): string {
  try {
    const parsed = new URL(String(url).replace(/^\$/, 'https://'));
    const path = parsed.pathname.replace(/^\//, '');
    return parsed.hostname === WALLET_HOST ? path : `${parsed.hostname}/${path}`;
  } catch {
    return String(url ?? '');
  }
}

export function toNumber(amount?: Amount | null): number {
  if (!amount) return 0;
  return Number(amount.value) / 10 ** amount.assetScale;
}

export function formatAmount(amount?: Amount | null): string {
  if (!amount) return '—';
  return formatMoney(toNumber(amount), amount.assetCode, amount.assetScale);
}

export function formatMoney(value: number, assetCode = 'COP', maxFraction = 2): string {
  const fraction = Number.isInteger(value) ? 0 : Math.min(maxFraction, 2);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: assetCode,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(value);
  } catch {
    return `${value.toLocaleString('es-CO', { maximumFractionDigits: maxFraction })} ${assetCode}`;
  }
}

export function toDecimal(amount?: Amount | null): string {
  if (!amount) return '';
  const scale = amount.assetScale;
  const digits = amount.value.padStart(scale + 1, '0');
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, '') : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

export function groupThousands(decimal: string): string {
  return decimal ? Number(decimal).toLocaleString('es-CO') : '';
}

export function formatThousandsInput(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return digits ? Number(digits).toLocaleString('es-CO') : '';
}

export function normalizeDecimal(input: string | number | null | undefined): string {
  let text = String(input ?? '')
    .replace(/[\s$]/g, '')
    .replace(/COP$/i, '');
  if (!text) return '';
  if (text.includes('.') && text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text =
      /,\d{1,2}$/.test(text) && (text.match(/,/g) || []).length === 1
        ? text.replace(',', '.')
        : text.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return '';
  if (Number(text) <= 0) return '';
  return text;
}

export function toMinor(decimal: string, scale = 2): bigint {
  const [whole = '0', fraction = ''] = decimal.split('.');
  return BigInt(whole + fraction.padEnd(scale, '0').slice(0, scale));
}

export interface PreviewRuleInput {
  label: string;
  kind: 'debt' | 'savings';
  shareBps: number;
  outstandingMinor?: bigint;
}

export interface PreviewSplitResult {
  items: { label: string; kind: 'debt' | 'savings'; amount: bigint }[];
  allocated: bigint;
  kept: bigint;
}

export function previewSplit(saleMinor: bigint, rules: PreviewRuleInput[]): PreviewSplitResult {
  let allocated = 0n;
  const items = rules.map((rule) => {
    let amount = (saleMinor * BigInt(rule.shareBps)) / 10000n;
    if (
      rule.kind === 'debt' &&
      rule.outstandingMinor !== undefined &&
      amount > rule.outstandingMinor
    ) {
      amount = rule.outstandingMinor;
    }
    if (amount > saleMinor - allocated) amount = saleMinor - allocated;
    if (amount < 0n) amount = 0n;
    allocated += amount;
    return { label: rule.label, kind: rule.kind, amount };
  });
  return { items, allocated, kept: saleMinor - allocated };
}

export function formatTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'short',
    day: 'numeric',
  });
}

export function salePace(createdAt: string): number {
  const age = Date.now() - Date.parse(createdAt);
  if (!Number.isFinite(age) || age < 60_000) return 1_000;
  if (age < 5 * 60_000) return 3_000;
  return 10_000;
}

export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith('/')) return '';
  let url: URL;
  try {
    url = new URL(next, window.location.origin);
  } catch {
    return '';
  }
  return url.origin === window.location.origin && !url.pathname.startsWith('/login')
    ? `${url.pathname}${url.search}${url.hash}`
    : '';
}

export const remember = {
  get(key: string): string {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing stored
    }
  },
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function poll(
  task: () => Promise<boolean | void>,
  interval: number | (() => number),
  destroyRef?: DestroyRef,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  const delay = () => (typeof interval === 'function' ? interval() : interval);

  const stop = () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };

  const run = async () => {
    timer = undefined;
    if (stopped || running || document.hidden) return;
    running = true;
    let again = true;
    try {
      again = (await task()) !== false;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status ?? 0;
      again = status < 400 || status >= 500 || status === 408 || status === 429;
    }
    running = false;
    if (!again) stop();
    else if (!stopped) timer = setTimeout(run, delay());
  };

  const onVisibility = () => {
    if (document.hidden || stopped || running) return;
    if (timer !== undefined) clearTimeout(timer);
    run();
  };

  document.addEventListener('visibilitychange', onVisibility);
  destroyRef?.onDestroy(stop);
  run();
  return stop;
}
