import { describe, expect, it } from 'vitest';
import { SECTION_IDS, SECTION_LABEL, isTillSection } from './navigation-intent';
import { TABS } from '../features/merchant/merchant.types';

describe('till navigation contract', () => {
  it('keeps every tab and its label in the destination allowlist', () => {
    expect(SECTION_IDS).toEqual(['inicio', 'vender', 'efectivo', 'metas', 'repartos', 'ajustes', 'avisos']);
    expect(TABS).toEqual(SECTION_IDS);
    expect(Object.keys(SECTION_LABEL)).toEqual(SECTION_IDS);
  });

  it.each(SECTION_IDS)('accepts the exact destination %s', (section) => {
    expect(isTillSection(section)).toBe(true);
    expect(SECTION_LABEL[section]).toBeTruthy();
  });

  it.each(['admin', 'estadísticas', 'Inicio', ' inicio ', 'abre inicio', '', null, undefined, 0, {}, ['inicio']].map((value) => ({ value })))(
    'rejects unknown runtime destinations without interpreting text: %j',
    ({ value }) => expect(isTillSection(value)).toBe(false),
  );
});
