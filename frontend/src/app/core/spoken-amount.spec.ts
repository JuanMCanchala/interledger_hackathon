import { describe, expect, it } from 'vitest';
import { parseSpokenSale, pesosInWords } from './spoken-amount';

describe('parseSpokenSale', () => {
  it('reads amounts the way people say them', () => {
    expect(parseSpokenSale('veinte mil')).toEqual({ amount: 20000, description: '' });
    expect(parseSpokenSale('veinte mil quinientos')?.amount).toBe(20500);
    expect(parseSpokenSale('treinta y cinco mil')?.amount).toBe(35000);
    expect(parseSpokenSale('ciento veinte mil')?.amount).toBe(120000);
    expect(parseSpokenSale('un millón doscientos mil')?.amount).toBe(1200000);
    expect(parseSpokenSale('veinte lucas')?.amount).toBe(20000);
    expect(parseSpokenSale('mil pesos')?.amount).toBe(1000);
  });

  it('reads digits, with or without thousand separators', () => {
    expect(parseSpokenSale('Cobra 15.500')?.amount).toBe(15500);
    expect(parseSpokenSale('$20.000')?.amount).toBe(20000);
  });

  it('keeps what follows as the description', () => {
    expect(parseSpokenSale('cobra veinte mil de arroz')).toEqual({ amount: 20000, description: 'arroz' });
    expect(parseSpokenSale('quince mil quinientos pesos de pan')).toEqual({
      amount: 15500,
      description: 'pan',
    });
  });

  it('finds nothing in a phrase without an amount', () => {
    expect(parseSpokenSale('hola')).toBeNull();
  });
});

describe('pesosInWords', () => {
  it('says amounts as a Colombian voice should', () => {
    expect(pesosInWords(20500)).toBe('veinte mil quinientos pesos');
    expect(pesosInWords(21000)).toBe('veintiún mil pesos');
    expect(pesosInWords(100)).toBe('cien pesos');
    expect(pesosInWords(1000000)).toBe('un millón de pesos');
    expect(pesosInWords(1250000)).toBe('un millón doscientos cincuenta mil pesos');
    expect(pesosInWords(345678)).toBe('trescientos cuarenta y cinco mil seiscientos setenta y ocho pesos');
  });
});
