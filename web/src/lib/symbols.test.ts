import { describe, it, expect } from 'vitest';
import { SYMBOLS, SYMBOL_LIST, getSymbolInfo } from './symbols';
import instruments from '../../data-pipeline/instruments.json';

// The registry is data-pipeline/instruments.json — these tests guard the shape
// every consumer relies on (web components, refresh Job symbol list, manifest
// instrument stamp that the engine prices from).

describe('instrument registry', () => {
  it('loads every registry entry with the fields consumers need', () => {
    expect(SYMBOL_LIST.length).toBe(instruments.length);
    for (const s of SYMBOL_LIST) {
      expect(s.symbol).toMatch(/^[a-z0-9]{1,20}$/); // package route validation
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.instrumentCode.length).toBeGreaterThan(0);
      expect(Number.isInteger(s.pricePrecision)).toBe(true);
      expect(s.pricePrecision).toBeGreaterThanOrEqual(0);
      expect(s.pricePrecision).toBeLessThanOrEqual(8);
      expect(['forex', 'index', 'commodity']).toContain(s.assetClass);
      expect(s.contractSize).toBeGreaterThan(0);
    }
  });

  it('has unique symbol ids', () => {
    expect(new Set(SYMBOL_LIST.map((s) => s.symbol)).size).toBe(SYMBOL_LIST.length);
  });

  it('keeps asset-class conventions coherent', () => {
    for (const s of SYMBOL_LIST) {
      if (s.assetClass === 'forex') expect(s.contractSize).toBe(100000);
      if (s.assetClass === 'index') expect(s.contractSize).toBe(1);
    }
  });

  it('getSymbolInfo falls back for unknown symbols without throwing', () => {
    const info = getSymbolInfo('nope');
    expect(info.symbol).toBe('nope');
    expect(info.contractSize).toBe(100000);
    expect(SYMBOLS['nope']).toBeUndefined();
  });
});
