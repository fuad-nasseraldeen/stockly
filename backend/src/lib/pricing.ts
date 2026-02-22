export const DEFAULT_DECIMAL_PRECISION = 2;

export function clampDecimalPrecision(value: unknown, fallback: number = DEFAULT_DECIMAL_PRECISION): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(8, Math.max(0, Math.floor(parsed)));
}

export function roundToPrecision(n: number, precision: number = DEFAULT_DECIMAL_PRECISION): number {
  if (!Number.isFinite(n)) return 0;
  const safePrecision = clampDecimalPrecision(precision);
  const factor = 10 ** safePrecision;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function round2(n: number): number {
  return roundToPrecision(n, 2);
}

export function round4(n: number): number {
  return roundToPrecision(n, 4);
}

export function calcCostAfterDiscount(
  cost_price: number,
  discount_percent: number,
  precision: number = 4,
): number {
  if (discount_percent <= 0) return cost_price;
  const discountAmount = cost_price * (discount_percent / 100);
  return roundToPrecision(cost_price - discountAmount, precision);
}

export function calcSellPrice(params: {
  cost_price: number;
  margin_percent: number;
  vat_percent: number;
  cost_price_after_discount?: number; // Optional: if provided, use this instead of cost_price
  use_margin?: boolean; // Optional: if false, don't add margin
  use_vat?: boolean; // Optional: if false, don't add VAT
  precision?: number;
}): number {
  const {
    cost_price,
    margin_percent,
    vat_percent,
    cost_price_after_discount,
    use_margin = true,
    use_vat = true,
    precision = DEFAULT_DECIMAL_PRECISION,
  } = params;
  // Use cost_price_after_discount if provided, otherwise use cost_price
  // IMPORTANT: cost_price and cost_price_after_discount are ALWAYS stored with VAT (gross)
  // So we need to extract the net price (before VAT) first, then add margin and VAT
  const effectiveCostGross = cost_price_after_discount ?? cost_price;
  
  // Extract net price (before VAT) if VAT is enabled
  // If use_vat is false, the cost is already net (no VAT was added)
  const effectiveCostNet = use_vat && vat_percent > 0
    ? effectiveCostGross / (1 + vat_percent / 100)
    : effectiveCostGross;
  
  // If use_margin is false and use_vat is false, return cost as-is
  if (!use_margin && !use_vat) {
    return roundToPrecision(effectiveCostGross, precision);
  }
  
  // If use_margin is false, only add VAT (if enabled)
  if (!use_margin) {
    if (!use_vat) {
      return roundToPrecision(effectiveCostGross, precision);
    }
    // effectiveCostNet is already net, so we add VAT to get gross
    const sell = effectiveCostNet + effectiveCostNet * (vat_percent / 100);
    return roundToPrecision(sell, precision);
  }
  
  // Add margin to net cost
  const base = effectiveCostNet + effectiveCostNet * (margin_percent / 100);
  
  // Add VAT only if enabled
  if (!use_vat) {
    return roundToPrecision(base, precision);
  }
  
  // Normal calculation: net cost + margin + VAT
  const sell = base + base * (vat_percent / 100);
  return roundToPrecision(sell, precision);
}

