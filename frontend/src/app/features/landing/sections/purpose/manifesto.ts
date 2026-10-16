import { DoodleName } from '../../../../shared/brand/doodle';

export interface Source {
  readonly label: string;
  readonly url: string;
}

export interface Figure {
  readonly value: string;
  readonly doodle: DoodleName;
  /** 1-based position in SOURCES, shown as the footnote number. */
  readonly source: number;
}

export type Segment = string | Figure;

export const SOURCES: readonly Source[] = [
  {
    label: 'DANE, Encuesta de Micronegocios (EMICRON) 2024, boletín técnico del 30 de julio de 2025.',
    url: 'https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-2024.pdf',
  },
  {
    label: 'DANE, Matriz de Trabajo 2025, citada por El Espectador el 13 de junio de 2026.',
    url: 'https://www.elespectador.com/economia/casi-la-mitad-del-trabajo-en-colombia-sigue-siendo-independiente/',
  },
  {
    label: 'Colombia Fintech con apoyo de Anif, citado por La República el 11 de abril de 2026.',
    url: 'https://www.larepublica.co/especiales/el-gota-a-gota/usura-la-mejor-aliada-de-la-ilegalidad-4368735',
  },
];

export const MANIFESTO: readonly Segment[] = [
  'En Colombia hay ',
  { value: '5,3 millones de micronegocios', doodle: 'billetera', source: 1 },
  ', y en ',
  { value: '9 de cada 10', doodle: 'ahorro', source: 1 },
  ' su dueño trabaja por su cuenta. Casi la mitad del trabajo del país, el ',
  { value: '44,7 %', doodle: 'crecimiento', source: 2 },
  ', es independiente. El ',
  { value: '97,5 % recibe pagos en efectivo', doodle: 'pago', source: 1 },
  ' y lo mezcla todo en un solo bolsillo. Cuando no alcanza, el «gota a gota» les cobra hasta ',
  { value: '382 % de interés al año', doodle: 'duda', source: 3 },
  '. MiPlante existe para que manejen sus deudas, su pensión, sus proveedores y sus gastos sin enredos.',
];

export const isFigure = (segment: Segment): segment is Figure => typeof segment !== 'string';
