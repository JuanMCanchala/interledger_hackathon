import { DoodleName } from '../../../../shared/brand/doodle';

export interface Chapter {
  readonly title: string;
  readonly text: string;
  readonly doodle: DoodleName;
  readonly notes?: readonly { readonly line: string; readonly crossed?: boolean }[];
}

export const CHAPTERS: readonly Chapter[] = [
  {
    title: 'Doña Nelly, echada pa’ lante',
    text: 'Trabaja de sol a sol en su propia tiendita de barrio. Lleva más de 15 años sacándola adelante. Hay días muy buenos y días malos: sus ventas nunca son iguales.',
    doodle: 'crecimiento',
  },
  {
    title: 'Su única aliada: un cuaderno viejo',
    text: 'Apenas terminó el bachillerato y las aplicaciones la confunden. Sus hijos casi nunca tienen tiempo de explicarle, así que lo anota todo a mano.',
    doodle: 'calculadora',
    notes: [
      { line: 'Lunes: vendí $85.000' },
      { line: 'Martes: casi nada, llovió' },
      { line: 'Le debo a Don Jorge $120.000', crossed: true },
      { line: '¿Cuota del préstamo?' },
    ],
  },
  {
    title: 'A fin de mes, no siempre alcanza',
    text: 'Le debe plata a varios proveedores y conocidos. Cuando llega el pedido y no hay con qué pagar, el «gota a gota» parece la única salida.',
    doodle: 'duda',
  },
  {
    title: 'Con MiPlante, cada venta se acomoda sola',
    text: 'Cuando un cliente le paga, la plata se reparte en sus bolsillos. Si un día no vende, ese día no paga. Y ve todo clarito en su celular.',
    doodle: 'planta',
  },
];
