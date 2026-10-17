/** The till's destinations; navigation requests are interpreted by the assistant's model. */
export const SECTION_IDS = ['inicio', 'vender', 'efectivo', 'metas', 'repartos', 'ajustes', 'avisos'] as const;

export type TillSection = (typeof SECTION_IDS)[number];

export const SECTION_LABEL: Record<TillSection, string> = {
  inicio: 'Inicio',
  vender: 'Vender',
  efectivo: 'Efectivo',
  metas: 'Metas',
  repartos: 'Repartos',
  ajustes: 'Ajustes',
  avisos: 'Avisos',
};

/** Network responses must name a real destination; unknown values never map to Inicio. */
export function isTillSection(value: unknown): value is TillSection {
  return typeof value === 'string' && SECTION_IDS.includes(value as TillSection);
}
