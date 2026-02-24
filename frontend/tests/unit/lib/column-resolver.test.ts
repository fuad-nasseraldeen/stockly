import { describe, expect, it } from 'vitest';
import { getAvailableColumns, getDefaultLayout, resolveColumns } from '../../../src/lib/column-resolver';

describe('column resolver VAT toggle', () => {
  it('hides VAT columns when use_vat is false', () => {
    const settings = { use_vat: false, use_margin: true, vat_percent: 18 };
    const available = getAvailableColumns(settings);
    const ids = new Set(available.map((c) => c.id));

    expect(ids.has('cost_net')).toBe(false);
    expect(ids.has('cost_after_discount_net')).toBe(false);
    expect(ids.has('vat_rate')).toBe(false);
  });

  it('shows VAT columns when use_vat is true', () => {
    const settings = { use_vat: true, use_margin: true, vat_percent: 18 };
    const available = getAvailableColumns(settings);
    const ids = new Set(available.map((c) => c.id));

    expect(ids.has('cost_net')).toBe(true);
    expect(ids.has('cost_after_discount_net')).toBe(true);
    expect(ids.has('vat_rate')).toBe(true);
  });

  it('default layout marks VAT fields hidden when use_vat is false', () => {
    const settings = { use_vat: false, use_margin: true, vat_percent: 18 };
    const layout = getDefaultLayout(settings);

    expect(layout.visible.cost_net).toBe(false);
    expect(layout.visible.cost_after_discount_net).toBe(false);
  });

  it('resolved columns never include VAT-only fields when VAT disabled', () => {
    const settings = { use_vat: false, use_margin: true, vat_percent: 18 };
    const columns = resolveColumns(settings);
    const ids = new Set(columns.map((c) => c.id));

    expect(ids.has('cost_net')).toBe(false);
    expect(ids.has('cost_after_discount_net')).toBe(false);
    expect(ids.has('vat_rate')).toBe(false);
  });
});
