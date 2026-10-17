import { describe, expect, it } from 'vitest';
import { SECTION_IDS, SECTION_LABEL, isTillSection, parseNavigation, wentTo } from './navigation-intent';
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

describe('parseNavigation', () => {
  it('reads where the shopkeeper asks to go', () => {
    expect(parseNavigation('Ya ven inicio')).toBe('inicio');
    expect(parseNavigation('llévame a inicio')).toBe('inicio');
    expect(parseNavigation('ve a avisos')).toBe('avisos');
    expect(parseNavigation('abre ajustes por favor')).toBe('ajustes');
    expect(parseNavigation('muéstrame mis metas')).toBe('metas');
    expect(parseNavigation('vamos a vender')).toBe('vender');
    expect(parseNavigation('regresa a la caja')).toBe('vender');
    expect(parseNavigation('Repartos')).toBe('repartos');
    expect(parseNavigation('a inicio')).toBe('inicio');
    expect(parseNavigation('quiero ver las notificaciones')).toBe('avisos');
  });

  it('leaves questions and other talk to the model', () => {
    expect(parseNavigation('¿Tengo avisos?')).toBeNull();
    expect(parseNavigation('cuántas ventas llevo')).toBeNull();
    expect(parseNavigation('qué es un reparto')).toBeNull();
    expect(parseNavigation('cómo voy con mis metas')).toBeNull();
    expect(parseNavigation('me fue bien en las ventas de hoy')).toBeNull();
    expect(parseNavigation('hola')).toBeNull();
  });
});

describe('wentTo', () => {
  it('catches a reply that says it opened a section', () => {
    expect(wentTo('Ahí tienes Inicio abierto. ¿Quieres que revisemos tus cuotas del mes?')).toBe('inicio');
    expect(wentTo('Te llevo a Avisos para que lo revises.')).toBe('avisos');
    expect(wentTo('Listo, te abro Ajustes.')).toBe('ajustes');
  });

  it('ignores replies that only mention one', () => {
    expect(wentTo('Ahí tienes tus ventas de hoy: llevas $ 50.000.')).toBeNull();
    expect(wentTo('Tienes dos avisos por revisar.')).toBeNull();
  });
});
