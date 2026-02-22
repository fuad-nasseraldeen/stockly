import { describe, it, expect } from 'vitest';
import { calcSellPrice, calcCostAfterDiscount, round2, roundToPrecision, clampDecimalPrecision } from '../../../src/lib/pricing';

describe('pricing utilities', () => {
  describe('round2', () => {
    it('should round to 2 decimal places', () => {
      expect(round2(10.123456)).toBe(10.12);
      expect(round2(10.125)).toBe(10.13);
      expect(round2(10.124)).toBe(10.12);
    });
  });

  describe('roundToPrecision', () => {
    it('rounds by provided precision', () => {
      expect(roundToPrecision(1.4759, 2)).toBe(1.48);
      expect(roundToPrecision(1.4759, 3)).toBe(1.476);
      expect(roundToPrecision(1.4759, 4)).toBe(1.4759);
    });
  });

  describe('clampDecimalPrecision', () => {
    it('clamps values to valid range 0..8', () => {
      expect(clampDecimalPrecision(-2, 2)).toBe(0);
      expect(clampDecimalPrecision(12, 2)).toBe(8);
      expect(clampDecimalPrecision('x', 2)).toBe(2);
    });
  });

  describe('calcCostAfterDiscount', () => {
    it('should calculate cost after discount', () => {
      expect(calcCostAfterDiscount(100, 10)).toBe(90);
      expect(calcCostAfterDiscount(100, 0)).toBe(100);
      expect(calcCostAfterDiscount(50, 20)).toBe(40);
    });

    it('should handle zero or negative discount', () => {
      expect(calcCostAfterDiscount(100, 0)).toBe(100);
      expect(calcCostAfterDiscount(100, -5)).toBe(100);
    });

    it('should honor custom decimal precision', () => {
      expect(calcCostAfterDiscount(1.9999, 12.5, 2)).toBe(1.75);
      expect(calcCostAfterDiscount(1.9999, 12.5, 4)).toBe(1.7499);
    });
  });

  describe('calcSellPrice', () => {
    it('should calculate sell price with margin and VAT', () => {
      // cost_price is stored WITH VAT (gross)
      const result = calcSellPrice({
        cost_price: 118, // 100 net + 18% VAT = 118 gross
        margin_percent: 30,
        vat_percent: 18,
      });
      // Net = 118 / 1.18 = 100, + 30% margin = 130, + 18% VAT = 153.4
      expect(result).toBe(153.4);
    });

    it('should use cost_price_after_discount if provided', () => {
      // cost_price_after_discount is stored WITH VAT (gross)
      const result = calcSellPrice({
        cost_price: 118, // 100 net + 18% VAT = 118 gross
        cost_price_after_discount: 106.2, // 90 net + 18% VAT = 106.2 gross
        margin_percent: 30,
        vat_percent: 18,
      });
      // Net = 106.2 / 1.18 = 90, + 30% margin = 117, + 18% VAT = 138.06
      expect(result).toBe(138.06);
    });

    it('should not add margin if use_margin is false', () => {
      // cost_price is stored WITH VAT (gross)
      // When use_margin is false, the function extracts net and adds VAT back
      const result = calcSellPrice({
        cost_price: 100, // Gross price (includes VAT)
        margin_percent: 30,
        vat_percent: 18,
        use_margin: false,
        use_vat: true,
      });
      // Net = 100 / 1.18 = 84.745..., + 18% VAT = 100
      expect(result).toBe(100);
    });

    it('should not add VAT if use_vat is false', () => {
      const result = calcSellPrice({
        cost_price: 100,
        margin_percent: 30,
        vat_percent: 18,
        use_vat: false,
      });
      // 100 (net) + 30% margin = 130
      expect(result).toBe(130);
    });

    it('should return cost as-is if both use_margin and use_vat are false', () => {
      const result = calcSellPrice({
        cost_price: 100,
        margin_percent: 30,
        vat_percent: 18,
        use_margin: false,
        use_vat: false,
      });
      expect(result).toBe(100);
    });

    it('should handle cost with VAT already included', () => {
      // If cost_price includes VAT, we need to extract net first
      const costWithVat = 118; // 100 + 18% VAT
      const result = calcSellPrice({
        cost_price: costWithVat,
        margin_percent: 30,
        vat_percent: 18,
        use_vat: true,
      });
      // Net = 118 / 1.18 = 100, + 30% = 130, + 18% = 153.4
      expect(result).toBe(153.4);
    });

    it('should honor precision parameter in output', () => {
      const p2 = calcSellPrice({
        cost_price: 1.4759,
        margin_percent: 7.5,
        vat_percent: 18,
        precision: 2,
      });
      const p4 = calcSellPrice({
        cost_price: 1.4759,
        margin_percent: 7.5,
        vat_percent: 18,
        precision: 4,
      });
      expect(p2).toBe(roundToPrecision(p4, 2));
      expect(p4).not.toBe(p2);
    });
  });
});
