import { describe, it, expect } from 'vitest';
import { normalizeName } from '../../../src/lib/normalize';

describe('normalizeName', () => {
  it('should trim whitespace', () => {
    expect(normalizeName('  test  ')).toBe('test');
    expect(normalizeName('\ttest\n')).toBe('test');
  });

  it('should convert to lowercase', () => {
    expect(normalizeName('TEST')).toBe('test');
    expect(normalizeName('Test Product')).toBe('test product');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeName('test    product')).toBe('test product');
    expect(normalizeName('test  \t  product')).toBe('test product');
  });

  it('should handle empty string', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('should handle Hebrew text', () => {
    expect(normalizeName('  מוצר  בדיקה  ')).toBe('מוצר בדיקה');
  });
});
