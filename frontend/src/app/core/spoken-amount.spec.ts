import { describe, expect, it } from 'vitest';
import { parseCashSale, parseChargeRequest, parseDeposit, parseSpokenSale, pesosInWords } from './spoken-amount';

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

describe('parseChargeRequest', () => {
  it('reads the charges people ask for, however they write the amount', () => {
    expect(parseChargeRequest('Por favor haz un cobre $50,000')).toEqual({ amount: 50000, description: '' });
    expect(parseChargeRequest('cobra 50.000')).toEqual({ amount: 50000, description: '' });
    expect(parseChargeRequest('Necesito hacer un cobro por $30000')).toEqual({ amount: 30000, description: '' });
    expect(parseChargeRequest('cobra veinte mil de arroz')).toEqual({ amount: 20000, description: 'arroz' });
    expect(parseChargeRequest('hazme un cobro de 15 lucas')).toEqual({ amount: 15000, description: '' });
    expect(parseChargeRequest('cóbrale cinco mil quinientos a don José')).toEqual({
      amount: 5500,
      description: 'don José',
    });
    expect(parseChargeRequest('genera un qr de 12.500')).toEqual({ amount: 12500, description: '' });
  });

  it('leaves questions and talk about charges to the model', () => {
    expect(parseChargeRequest('¿cuánto cobré hoy?')).toBeNull();
    expect(parseChargeRequest('cuántos cobros llevo')).toBeNull();
    expect(parseChargeRequest('la distribuidora me cobra 200 mil')).toBeNull();
    expect(parseChargeRequest('ayer cobré 50 mil')).toBeNull();
    expect(parseChargeRequest('haz un cobro')).toBeNull();
    expect(parseChargeRequest('¿Cómo voy este mes?')).toBeNull();
  });
});

describe('parseSpokenSale articles', () => {
  it('does not take "un" in "un cobro de" for one peso', () => {
    expect(parseSpokenSale('un cobro de veinte mil')).toEqual({ amount: 20000, description: '' });
  });
});

describe('cash', () => {
  it('reads cash sales however they are said', () => {
    expect(parseCashSale('vendí 15 mil de pan en efectivo')).toEqual({ amount: 15000, description: 'pan' });
    expect(parseCashSale('me pagaron 20.000 en efectivo')).toEqual({ amount: 20000, description: '' });
    expect(parseCashSale('registra una venta en efectivo de 8 mil')).toEqual({ amount: 8000, description: '' });
    expect(parseCashSale('cobra 20 mil en efectivo')).toEqual({ amount: 20000, description: '' });
    expect(parseCashSale('venta en billetes de $12,500 de gaseosas')).toEqual({ amount: 12500, description: 'gaseosas' });
  });

  it('leaves questions and deposits alone', () => {
    expect(parseCashSale('¿cuánto vendí en efectivo hoy?')).toBeNull();
    expect(parseCashSale('cuánto efectivo tengo que consignar')).toBeNull();
    expect(parseCashSale('consigné 10 mil del efectivo')).toBeNull();
    expect(parseCashSale('vendí 15 mil')).toBeNull();
  });

  it('reads deposits', () => {
    expect(parseDeposit('consigné 50 mil')).toBe(50000);
    expect(parseDeposit('ya deposité los 3.000')).toBe(3000);
    expect(parseDeposit('Gloria, consigne 4500 pesos')).toBe(4500);
    expect(parseDeposit('cuánto tengo que consignar')).toBeNull();
    expect(parseDeposit('¿ya consigné?')).toBeNull();
    expect(parseDeposit('voy a consignar')).toBeNull();
  });
});
