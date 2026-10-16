import { DoodleName } from '../../../shared/brand/doodle';

export interface Pocket {
  readonly name: string;
  readonly percent: number;
  readonly doodle: DoodleName;
}

export const POCKETS: readonly Pocket[] = [
  { name: 'Para ti', percent: 80, doodle: 'billetera' },
  { name: 'Proveedores', percent: 10, doodle: 'pago' },
  { name: 'Fondo Anti‑Gota', percent: 5, doodle: 'monedas' },
  { name: 'Ahorro', percent: 5, doodle: 'alcancia' },
];

/** Splits a sale in whole pesos; rounding leftovers stay with the shopkeeper. */
export function splitSale(pesos: number): number[] {
  const shares = POCKETS.map((p) => Math.floor((pesos * p.percent) / 100));
  shares[0] += pesos - shares.reduce((sum, s) => sum + s, 0);
  return shares;
}
