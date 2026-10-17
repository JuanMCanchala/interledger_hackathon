/**
 * Where the shopkeeper asks to go ("llévame a inicio", "ve a avisos", "abre ajustes", or just
 * "avisos"), read on the device so moving around the till never depends on the model.
 */

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

const SECTION_WORDS: [RegExp, TillSection][] = [
  [/\b(inicio|principal|home|resumen|comienzo)\b/, 'inicio'],
  [/\b(efectivo|consignar|consignacion|consignaciones)\b/, 'efectivo'],
  [/\b(vender|venta|ventas|caja|cobrar|cobros|qr)\b/, 'vender'],
  [/\b(metas?|ahorros?)\b/, 'metas'],
  [/\b(repartos?|bolsillos?)\b/, 'repartos'],
  [/\b(ajustes?|configuracion|configurar|opciones)\b/, 'ajustes'],
  [/\b(avisos?|notificaciones|notificacion|alertas?)\b/, 'avisos'],
];

/** Asking to go somewhere; "ven" is how recognition often writes "ve". */
const GO =
  /\b(ve|ven|vete|ir|vamos|vayamos|llevame|lleva|llevar|abre|abreme|abrir|abri|muestrame|muestra|mostrar|ensename|pasa|pasame|entra|entrar|regresa|regresame|regresar|vuelve|volver|devuelveme|quiero ver|ver|mira|cambia)\b/;
/** GlorIA saying she took the shopkeeper there ("te llevo a avisos", "Inicio abierto"). */
const WENT_BEFORE = '(te llevo a|te lleve a|te abro|te abri|abri|ya estas en)( la seccion de| la pestana de| tu| tus| el| la| los| las)? ';
const WENT_AFTER = ' (abierto|abierta|abiertos|abiertas)';
const QUESTION = /^(cuanto|cuantos|cuantas|que|como|cuando|donde|por que|cual|cuales|tengo|hay)\b/;

function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionIn(text: string): TillSection | null {
  for (const [words, section] of SECTION_WORDS) if (words.test(text)) return section;
  return null;
}

/** The section the shopkeeper asks to go to, or null when the message is about something else. */
export function parseNavigation(text: string): TillSection | null {
  if (text.includes('¿') || text.trim().endsWith('?')) return null;
  const p = plain(text);
  if (!p || QUESTION.test(p)) return null;
  const section = sectionIn(p);
  if (!section) return null;
  // "Avisos", "a inicio por favor": a short message that is only the place.
  const words = p.split(' ').filter((w) => !['a', 'al', 'la', 'el', 'los', 'las', 'por', 'favor', 'gloria', 'ya'].includes(w));
  if (words.length === 1) return section;
  return GO.test(p) ? section : null;
}

/**
 * The section a reply of GlorIA's says she opened ("Ahí tienes Inicio abierto"), for when the model
 * says it without doing it. Null when the reply only mentions a section.
 */
export function wentTo(reply: string): TillSection | null {
  const p = plain(reply);
  for (const [words, section] of SECTION_WORDS) {
    const word = words.source.replace(/^\\b/, '').replace(/\\b$/, '');
    if (new RegExp(`${WENT_BEFORE}${word}\\b`).test(p) || new RegExp(`\\b${word}${WENT_AFTER}\\b`).test(p)) {
      return section;
    }
  }
  return null;
}
