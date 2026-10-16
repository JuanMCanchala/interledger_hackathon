import { splitSale } from './pockets';

describe('splitSale', () => {
  it('splits a round sale by the pocket percentages', () => {
    expect(splitSale(20000)).toEqual([16000, 2000, 1000, 1000]);
  });

  it('never loses a peso and gives the leftovers to the shopkeeper', () => {
    const shares = splitSale(1999);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1999);
    expect(shares).toEqual([1602, 199, 99, 99]);
  });
});
