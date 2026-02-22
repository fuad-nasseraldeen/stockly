import { describe, expect, it } from 'vitest';
import { __testables } from '../../../src/routes/import';

describe('import route normalization', () => {
  it('prioritizes supplier from mapped column over global supplier fallback', () => {
    const rows = [
      ['שם מוצר', 'ספק', 'מחיר'],
      ['מוצר א', 'ספק מהקובץ', '10'],
    ];
    const mapping = {
      product_name: 0,
      supplier: 1,
      price: 2,
    } as Record<string, number | null>;

    const result = __testables.normalizeRowsWithMapping(rows, true, mapping, {
      sourceType: 'excel',
      manualSupplierName: 'ספק גלובלי',
    });

    expect(result.fieldErrors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].supplier).toBe('ספק מהקובץ');
  });

  it('applies manual global values to all rows when row-level override is missing', () => {
    const rows = [
      ['שם מוצר', 'ספק', 'מחיר', 'קטגוריה'],
      ['מוצר א', 'ספק א', '10', ''],
      ['מוצר ב', 'ספק ב', '12', ''],
    ];
    const mapping = {
      product_name: 0,
      supplier: 1,
      price: 2,
      category: 3,
    } as Record<string, number | null>;

    const result = __testables.normalizeRowsWithMapping(rows, true, mapping, {
      sourceType: 'excel',
      manualGlobalValues: { category: 'קטגוריה כללית' },
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].category).toBe('קטגוריה כללית');
    expect(result.rows[1].category).toBe('קטגוריה כללית');
  });

  it('treats supplier-only excel row as supplier continuation of previous product row', () => {
    const rows = [
      ['שם מוצר', 'ספק', 'מחיר', 'מקט'],
      ['מוצר א', 'ספק א', '10', '1001'],
      ['', 'ספק ב', '', ''],
    ];
    const mapping = {
      product_name: 0,
      supplier: 1,
      price: 2,
      sku: 3,
    } as Record<string, number | null>;

    const result = __testables.normalizeRowsWithMapping(rows, true, mapping, {
      sourceType: 'excel',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].supplier).toBe('ספק ב');
    expect(result.rowErrors).toEqual([]);
  });

  it('supports sheetIndex = -1 as merge-all-sheets selector', () => {
    expect(__testables.parseSheetIndex(-1, 3)).toBe(-1);
    expect(__testables.parseSheetIndex(99, 3)).toBe(0);
    expect(__testables.parseSheetIndex(1, 3)).toBe(1);
  });
});
