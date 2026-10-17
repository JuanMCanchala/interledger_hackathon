/**
 * Pesos as people say them, both ways: what the shopkeeper dictates ("veinte mil quinientos",
 * "15.500", "dos mil pesos de arroz") becomes an amount, and an amount becomes words a voice reads
 * well ("veinte mil quinientos pesos"), whatever the device's voice does with "$ 20.500".
 */

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
  veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200,
  doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700,
  setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * The amount in a dictated phrase, in whole pesos, and what follows it as the description
 * ("cobra veinte mil de arroz" → 20000, "arroz"). Null when it holds no amount.
 */
export function parseSpokenSale(text: string): { amount: number; description: string } | null {
  const words = plain(text)
    // "20.000", "20 000", "$20.000", "$50,000" → "20000"; "1,5 millones" stays a decimal.
    .replace(/(\d)[.,\s](?=\d{3}\b)/g, '$1')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[$¡!¿?]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let group = 0;
  let seen = false;
  let end = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const digits = /^\d+(\.\d+)?$/.test(w) ? Number(w) : null;
    if (digits !== null) {
      group += digits;
    } else if (w in UNITS) {
      group += UNITS[w];
    } else if (w === 'mil') {
      group = (group || 1) * 1000;
      total += group;
      group = 0;
    } else if (w === 'millon' || w === 'millones') {
      total = (total + (group || 1)) * 1_000_000;
      group = 0;
    } else if (w === 'y' && seen) {
      continue;
    } else if (w === 'lucas' || w === 'luca') {
      // "veinte lucas": colloquial thousands.
      total += (group || 1) * 1000;
      group = 0;
    } else if (seen) {
      if (w === 'pesos' || w === 'peso') {
        end = i;
        continue;
      }
      // "un cobro de veinte mil": that "un" was an article, not one peso. Keep looking.
      if (total === 0 && group === 1 && ['un', 'una', 'uno'].includes(words[i - 1]!)) {
        group = 0;
        seen = false;
        end = -1;
        continue;
      }
      break;
    } else {
      continue;
    }
    seen = true;
    end = i;
  }
  const amount = Math.round(total + group);
  if (!seen || amount <= 0) return null;
  const rest = text
    .split(/\s+/)
    .slice(end + 1)
    .join(' ')
    .replace(/^(de|del|por|en)\s+/i, '')
    .trim();
  return { amount, description: rest };
}

/** Words that ask to charge now: "cobra", "cóbrale", "haz un cobro", "genera el QR"… */
const CHARGE_WORDS = new Set([
  'cobra', 'cobrale', 'cobrales', 'cobrame', 'cobrar', 'cobrarle', 'cobro', 'cobre', 'cobrale',
  'qr', 'factura', 'facturale',
]);
/** "¿Cuánto cobré?", "me cobra 200 mil": talk about charges, not a request to charge. */
const NOT_A_REQUEST = /^(cuanto|cuantos|cuantas|que|como|cuando|donde|por que|cual)\b|\b(me|le|nos|les|te) cobra\b|\b(cobre|cobro|cobraron|cobramos|cobraste)\b.*\b(ayer|hoy|semana|mes)\b/;

/**
 * A request to charge an amount ("cobra 50.000", "haz un cobro de $50,000 de arroz"), read here so
 * it never depends on the model. Null for questions about charges or phrases without an amount.
 */
export function parseChargeRequest(text: string): { amount: number; description: string } | null {
  const raw = text.toLowerCase().trim();
  // Past tense written with its accent ("cobré", "cobró") is talk about what was charged.
  if (/cobr[éó](?![a-záéíóúñ])/.test(raw) || raw.includes('¿') || raw.endsWith('?')) return null;
  const words = plain(raw).split(/\s+/);
  const at = words.findIndex((w) => CHARGE_WORDS.has(w.replace(/[^a-z]/g, '')));
  if (at < 0 || NOT_A_REQUEST.test(plain(raw).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim())) {
    return null;
  }
  // The amount is what follows the word that asks to charge.
  const rest = text.trim().split(/\s+/).slice(at + 1).join(' ');
  const sale = parseSpokenSale(rest);
  if (!sale || sale.amount < 100) return null;
  return { amount: sale.amount, description: sale.description.replace(/^(a|al|para)\s+/i, '') };
}

/** "En efectivo", "en billetes": how the customer paid when it was not by QR. */
const CASH_WORDS = /\b(en efectivo|efectivo|en billetes|en cash|cash)\b/gi;
const DEPOSIT_WORD = /\b(consign[a-z]*|deposit[a-z]*)\b/;

function isQuestion(raw: string): boolean {
  const p = plain(raw).replace(/[^a-z0-9 ]/g, ' ').trim();
  return raw.includes('¿') || raw.trim().endsWith('?') || /^(cuanto|cuantos|cuanta|que|como|cuando|tengo que|debo)\b/.test(p);
}

/**
 * A sale paid in cash ("vendí 15 mil de pan en efectivo", "me pagaron 20.000 en efectivo",
 * "registra una venta en efectivo de 8 mil"), read on the device (ADR 0019). Null for questions,
 * deposits, or phrases without an amount.
 */
export function parseCashSale(text: string): { amount: number; description: string } | null {
  if (isQuestion(text) || DEPOSIT_WORD.test(plain(text))) return null;
  if (!text.match(CASH_WORDS)) return null;
  const sale = parseSpokenSale(text.replace(CASH_WORDS, ' ').replace(/\s+/g, ' '));
  if (!sale || sale.amount < 100) return null;
  return { amount: sale.amount, description: sale.description.replace(/^(de|del|por)\s+/i, '') };
}

/** Cash deposited into the wallet ("consigné 50 mil", "ya deposité 3.000"), or null. */
export function parseDeposit(text: string): number | null {
  if (isQuestion(text)) return null;
  const words = text.trim().split(/\s+/);
  const at = words.findIndex((w) => DEPOSIT_WORD.test(plain(w)));
  if (at < 0) return null;
  const sale = parseSpokenSale(words.slice(at + 1).join(' '));
  return sale && sale.amount > 0 ? sale.amount : null;
}

const ONES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function belowThousand(n: number): string {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest < 30) {
    if (rest) parts.push(ONES[rest]);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    parts.push(u ? `${TENS[t]} y ${ONES[u]}` : TENS[t]);
  }
  return parts.join(' ');
}

/** 20500 → "veinte mil quinientos pesos"; 1000000 → "un millón de pesos". */
export function pesosInWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return 'cero pesos';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'un millón' : `${belowThousand(millions)} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${belowThousand(thousands)} mil`);
  if (rest) parts.push(belowThousand(rest));
  const words = parts.join(' ');
  // "un millón de pesos", but "un millón doscientos mil pesos".
  const of = millions && !thousands && !rest ? ' de' : '';
  return `${value < 0 ? 'menos ' : ''}${words}${of} pesos`;
}
