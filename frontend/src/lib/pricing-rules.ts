/**
 * Pricing Rules and Calculations
 * 
 * INVARIANT: The system stores ONLY cost_price_gross (cost including VAT).
 * All other values (net, VAT amount, profit) are derived at runtime.
 */

// Centralized VAT rate (Israel)
export const VAT_RATE = 0.18;

/**
 * Convert net price (before VAT) to gross price (with VAT)
 */
export function netToGross(netPrice: number, vatRate: number = VAT_RATE): number {
  return netPrice * (1 + vatRate);
}

/**
 * Convert gross price (with VAT) to net price (before VAT)
 */
export function grossToNet(grossPrice: number, vatRate: number = VAT_RATE): number {
  return grossPrice / (1 + vatRate);
}

/**
 * Calculate VAT amount from gross price
 */
export function getVatAmount(grossPrice: number, vatRate: number = VAT_RATE): number {
  return grossPrice - grossToNet(grossPrice, vatRate);
}

/**
 * Calculate cost after discount
 */
export function applyDiscount(costPrice: number, discountPercent: number): number {
  if (discountPercent <= 0) return costPrice;
  return Math.round((costPrice * (1 - discountPercent / 100) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate sell price from cost (with margin and VAT)
 */
export function calculateSellPrice(params: {
  costPriceGross: number; // Always gross (with VAT if VAT enabled)
  marginPercent: number;
  vatRate: number;
  costPriceAfterDiscountGross?: number;
  vatEnabled: boolean;
  marginEnabled: boolean;
}): number {
  const {
    costPriceGross,
    marginPercent,
    vatRate,
    costPriceAfterDiscountGross,
    vatEnabled,
    marginEnabled,
  } = params;

  // Use cost after discount if provided, otherwise use cost price
  const effectiveCostGross = costPriceAfterDiscountGross ?? costPriceGross;

  // Extract net price if VAT is enabled (for margin calculation)
  const effectiveCostNet = vatEnabled
    ? grossToNet(effectiveCostGross, vatRate)
    : effectiveCostGross;

  // If neither margin nor VAT is enabled, return cost as-is
  if (!marginEnabled && !vatEnabled) {
    return Math.round((effectiveCostGross + Number.EPSILON) * 100) / 100;
  }

  // If margin is disabled, only add VAT if enabled
  if (!marginEnabled) {
    if (!vatEnabled) {
      return Math.round((effectiveCostGross + Number.EPSILON) * 100) / 100;
    }
    // VAT is already included in effectiveCostGross, so return as-is
    return Math.round((effectiveCostGross + Number.EPSILON) * 100) / 100;
  }

  // Add margin to net cost
  const baseWithMargin = effectiveCostNet + effectiveCostNet * (marginPercent / 100);

  // Add VAT if enabled
  if (!vatEnabled) {
    return Math.round((baseWithMargin + Number.EPSILON) * 100) / 100;
  }

  // Normal calculation: net cost + margin + VAT
  const sellPrice = baseWithMargin * (1 + vatRate);
  return Math.round((sellPrice + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate profit amount (sell price - cost)
 */
export function calculateProfitAmount(
  sellPrice: number,
  costPriceGross: number
): number {
  return Math.round((sellPrice - costPriceGross + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate profit percentage
 */
export function calculateProfitPercent(
  sellPrice: number,
  costPriceGross: number
): number {
  if (costPriceGross === 0) return 0;
  return Math.round(((sellPrice - costPriceGross) / costPriceGross * 100 + Number.EPSILON) * 100) / 100;
}
