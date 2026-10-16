export interface Stat {
  readonly value: number;
  readonly prefix?: string;
  readonly suffix: string;
  readonly decimals?: number;
  readonly text: string;
  readonly source: string;
}

const PENDING_DANE = '[FUENTE DANE PENDIENTE]';

export const STATS: readonly Stat[] = [
  {
    value: 4.6,
    decimals: 1,
    prefix: 'más de ',
    suffix: ' millones',
    text: 'de micronegocios y trabajadores independientes en Colombia: tenderos, barberos, vendedores ambulantes.',
    source: PENDING_DANE,
  },
  {
    value: 44,
    suffix: ' %',
    text: 'de la fuerza laboral del país vive de un negocio propio o de trabajar por su cuenta.',
    source: PENDING_DANE,
  },
  {
    value: 65,
    suffix: ' %',
    text: 'de los pagos que reciben llegan en efectivo y se mezclan en un solo bolsillo.',
    source: PENDING_DANE,
  },
  {
    value: 200,
    prefix: 'más de ',
    suffix: ' %',
    text: 'de interés cobra el préstamo «gota a gota», al que muchos acuden cuando no les alcanza.',
    source: '[FUENTE PENDIENTE]',
  },
];
