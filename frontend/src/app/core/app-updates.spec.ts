import { describe, expect, it } from 'vitest';
import { isStaleChunkError } from './app-updates';

describe('isStaleChunkError', () => {
  it('recognizes a lazy chunk of another build in each browser', () => {
    const chrome = new TypeError(
      'Failed to fetch dynamically imported module: https://app.miplante.online/chunk-DRGA-woW.js',
    );
    expect(isStaleChunkError(chrome)).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(
      true,
    );
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('leaves any other navigation error to the router', () => {
    expect(isStaleChunkError(new Error('Cannot match any routes'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});
