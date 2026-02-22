type SettingsLike = {
  decimal_precision?: number | null;
};

export const DEFAULT_DECIMAL_PRECISION = 2;

export function clampDecimalPrecision(value: unknown, fallback: number = DEFAULT_DECIMAL_PRECISION): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(8, Math.max(0, Math.floor(parsed)));
}

export function getDecimalPrecision(settings?: SettingsLike | null): number {
  return clampDecimalPrecision(settings?.decimal_precision, DEFAULT_DECIMAL_PRECISION);
}

export function roundToPrecision(value: number, precision: number): number {
  if (!Number.isFinite(value)) return 0;
  const safePrecision = clampDecimalPrecision(precision);
  const factor = 10 ** safePrecision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatNumberTrimmed(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '0';
  const safePrecision = clampDecimalPrecision(precision);
  return parseFloat(value.toFixed(safePrecision)).toString();
}

