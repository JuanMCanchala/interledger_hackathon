/**
 * "Gloria" as the till hears it. Speech recognition writes her name in many ways ("Gloria,",
 * "glorias", "Gloría", "Loria", "Floria"…), so a word one letter away from it counts too.
 */

const NAME = 'gloria';

function plain(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zñ]/g, '');
}

/** Levenshtein distance, enough for one short word. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

function isName(word: string): boolean {
  const w = plain(word);
  if (w.length < 5 || w.length > 7) return false;
  return w === NAME || w === 'glorias' || distance(w, NAME) <= 1;
}

/**
 * What follows her name ("oye Gloria, cobra veinte mil" → "cobra veinte mil"), an empty string for
 * her name alone, or null when she was not called.
 */
export function afterWakeWord(text: string): string | null {
  const words = text.split(/(\s+)/);
  for (let i = 0; i < words.length; i++) {
    if (!isName(words[i]!)) continue;
    return words
      .slice(i + 1)
      .join('')
      .replace(/^[\s,.:;!?]+/, '')
      .trim();
  }
  return null;
}

/** Whether a phrase heard is just GlorIA's own voice coming back from the speaker. */
export function isEcho(heard: string, spoken: string): boolean {
  const h = plain(heard.replace(/\s+/g, ''));
  const s = plain(spoken.replace(/\s+/g, ''));
  return h.length >= 4 && s.includes(h);
}
