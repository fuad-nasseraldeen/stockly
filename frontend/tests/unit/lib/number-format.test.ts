import { describe, expect, it } from 'vitest';
import { clampDecimalPrecision, formatNumberTrimmed, getDecimalPrecision, priceInputPlaceholder, priceInputStep, roundToPrecision } from '../../../src/lib/number-format';

describe('number-format', () => {
  it('clamps precision to 0..8', () => {
    expect(clampDecimalPrecision(-1, 2)).toBe(0);
    expect(clampDecimalPrecision(99, 2)).toBe(8);
    expect(clampDecimalPrecision('bad', 2)).toBe(2);
  });

  it('returns tenant precision with fallback', () => {
    expect(getDecimalPrecision({ decimal_precision: 4 })).toBe(4);
    expect(getDecimalPrecision({ decimal_precision: null })).toBe(2);
    expect(getDecimalPrecision(undefined)).toBe(2);
  });

  it('formats values with trailing zero trim', () => {
    expect(formatNumberTrimmed(1.5, 4)).toBe('1.5');
    expect(formatNumberTrimmed(1.23456, 4)).toBe('1.2346');
    expect(formatNumberTrimmed(10, 4)).toBe('10');
  });

  it('rounds by selected precision', () => {
    expect(roundToPrecision(1.4759, 2)).toBe(1.48);
    expect(roundToPrecision(1.4759, 4)).toBe(1.4759);
  });

  it('priceInputStep respects precision', () => {
    expect(priceInputStep(0)).toBe('1');
    expect(priceInputStep(1)).toBe('0.1');
    expect(priceInputStep(2)).toBe('0.01');
    expect(priceInputStep(3)).toBe('0.001');
    expect(priceInputStep(4)).toBe('0.0001');
  });

  it('priceInputPlaceholder respects precision', () => {
    expect(priceInputPlaceholder(0)).toBe('0');
    expect(priceInputPlaceholder(1)).toBe('0.0');
    expect(priceInputPlaceholder(2)).toBe('0.00');
    expect(priceInputPlaceholder(3)).toBe('0.000');
    expect(priceInputPlaceholder(4)).toBe('0.0000');
  });
});
