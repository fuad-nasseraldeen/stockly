export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcSellPrice(params: {
  cost_price: number;
  margin_percent: number;
  vat_percent: number;
}): number {
  const { cost_price, margin_percent, vat_percent } = params;
  const base = cost_price + cost_price * (margin_percent / 100);
  const sell = base + base * (vat_percent / 100);
  return round2(sell);
}

