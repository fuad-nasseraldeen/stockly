/**
 * Price Table Column Registry
 * 
 * Defines all possible columns for price tables.
 * Columns are filtered and ordered based on settings and user layout preferences.
 */

import { Tooltip } from '../components/ui/tooltip';
import { grossToNet, calculateProfitAmount } from './pricing-rules';
import * as React from 'react';
import { formatNumberTrimmed, getDecimalPrecision } from './number-format';

function formatUnitPrice(num: number, settings?: Settings): string {
  if (isNaN(num) || num === null || num === undefined) return '0';
  return formatNumberTrimmed(num, getDecimalPrecision(settings));
}

export type ColumnId =
  | 'supplier'
  | 'cost_gross'
  | 'cost_net'
  | 'discount'
  | 'cost_after_discount_gross'
  | 'cost_after_discount_net'
  | 'pricing_unit'
  | 'quantity_per_carton'
  | 'package_type'
  | 'vat_rate'
  | 'carton_price'
  | 'sell_price'
  | 'profit_amount'
  | 'profit_percent'
  | 'date'
  | 'actions';

export type ColumnRequirement = {
  vat?: boolean; // Requires VAT to be enabled
  margin?: boolean; // Requires margin to be enabled
  discount?: boolean; // Requires discount to exist (optional, for conditional display)
};

export type ColumnDefinition = {
  id: ColumnId;
  headerLabel: string;
  headerSubLabel?: string; // Small text below header
  tooltip?: string;
  group: 'pricing' | 'inventory' | 'metadata';
  requires?: ColumnRequirement;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  renderHeader: () => React.ReactNode;
  renderCell: (price: PriceData, product: ProductData | null | undefined, settings: Settings) => React.ReactNode;
};

export type PriceData = {
  id?: string; // Price entry ID (for edit/delete operations)
  cost_price: number; // Always gross (with VAT if VAT enabled)
  cost_price_after_discount?: number | null; // Always gross
  discount_percent?: number | null;
  package_quantity?: number | null;
  package_type?: 'carton' | 'gallon' | 'bag' | 'bottle' | 'pack' | 'shrink' | 'sachet' | 'can' | 'roll' | 'unknown' | null;
  vat_rate?: number | null;
  sell_price?: number;
  margin_percent?: number | null;
  supplier_id: string;
  supplier_name?: string;
  created_at: string;
};

export type ProductData = {
  package_quantity?: number | null;
  unit?: 'unit' | 'kg' | 'liter' | string | null;
};

export type Settings = {
  use_vat?: boolean;
  use_margin?: boolean;
  vat_percent?: number;
  global_margin_percent?: number;
  decimal_precision?: number | null;
};

/**
 * Get package quantity: first from price (supplier-specific), then product, then default to 1
 */
function getPackageQuantity(price: PriceData, product: ProductData | null | undefined): number {
  const pricePackageQty = price.package_quantity;
  const productPackageQty = product?.package_quantity;
  
  if (pricePackageQty !== null && pricePackageQty !== undefined && !isNaN(Number(pricePackageQty)) && Number(pricePackageQty) > 0) {
    return Number(pricePackageQty);
  }
  if (productPackageQty !== null && productPackageQty !== undefined && !isNaN(Number(productPackageQty)) && Number(productPackageQty) > 0) {
    return Number(productPackageQty);
  }
  return 1;
}

function formatPricingUnit(unit: unknown): string {
  const normalized = String(unit ?? '').toLowerCase().trim();
  if (normalized === 'kg') return 'ק"ג';
  if (normalized === 'liter') return 'ליטר';
  return 'יחידה';
}

function formatPackageType(packageType: unknown): string {
  const normalized = String(packageType ?? '').toLowerCase().trim();
  if (normalized === 'carton') return 'קרטון';
  if (normalized === 'gallon') return 'גלון';
  if (normalized === 'bag') return 'שק';
  if (normalized === 'bottle') return 'בקבוק';
  if (normalized === 'pack') return 'מארז';
  if (normalized === 'shrink') return 'שרינק';
  if (normalized === 'sachet') return 'שקית';
  if (normalized === 'can') return 'פחית/קופסה';
  if (normalized === 'roll') return 'גליל';
  return 'לא ידוע';
}

/**
 * Column Registry - All possible columns
 */
export const PRICE_COLUMN_REGISTRY: Record<ColumnId, ColumnDefinition> = {
  supplier: {
    id: 'supplier',
    headerLabel: 'ספק',
    group: 'metadata',
    minWidth: 120,
    renderHeader: () => <span>ספק</span>,
    renderCell: (price: PriceData) => <span>{price.supplier_name || 'לא ידוע'}</span>,
  },

  cost_gross: {
    id: 'cost_gross',
    headerLabel: 'מחיר עלות',
    headerSubLabel: '(מחיר לאחר הנחה כולל מע"מ)',
    tooltip: 'מחיר עלות כולל מע"מ (אחרי הנחה אם קיימת)',
    group: 'pricing',
    minWidth: 100,
    renderHeader: () => (
      <div className="flex items-center gap-1">
        <span>מחיר עלות</span>
        <Tooltip content="מחיר עלות כולל מע&quot;מ (אחרי הנחה אם קיימת)" />
      </div>
    ),
    renderCell: (price: PriceData, _product: ProductData | null | undefined, settings: Settings) => {
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      return <span>₪{formatUnitPrice(costAfterDiscount, settings)}</span>;
    },
  },

  cost_net: {
    id: 'cost_net',
    headerLabel: 'מחיר לפני מע"מ',
    group: 'pricing',
    requires: { vat: true },
    minWidth: 120,
    renderHeader: () => <span>מחיר לפני מע&quot;מ</span>,
    renderCell: (price: PriceData, _product: ProductData | null | undefined, _settings: Settings) => {
      const vatRate = (_settings.vat_percent || 18) / 100;
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      const netPrice = grossToNet(costAfterDiscount, vatRate);
      return <span>₪{formatUnitPrice(netPrice, _settings)}</span>;
    },
  },

  discount: {
    id: 'discount',
    headerLabel: 'הנחה',
    group: 'pricing',
    minWidth: 80,
    align: 'center',
    renderHeader: () => <span>הנחה</span>,
    renderCell: (price: PriceData) => (
      <span className="text-center">
        {price.discount_percent && Number(price.discount_percent) > 0
          ? `${Number(price.discount_percent).toFixed(1)}%`
          : '-'}
      </span>
    ),
  },

  cost_after_discount_gross: {
    id: 'cost_after_discount_gross',
    headerLabel: 'מחיר לאחר הנחה (כולל מע"מ)',
    headerSubLabel: '(כולל מע"מ)',
    group: 'pricing',
    minWidth: 120,
    renderHeader: () => (
      <div>
        <div>מחיר לאחר הנחה</div>
        <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(כולל מע&quot;מ)</div>
      </div>
    ),
    renderCell: (price: PriceData, _product: ProductData | null | undefined, settings: Settings) => {
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      return <span>₪{formatUnitPrice(costAfterDiscount, settings)}</span>;
    },
  },

  cost_after_discount_net: {
    id: 'cost_after_discount_net',
    headerLabel: 'מחיר לאחר הנחה (לפני מע"מ)',
    headerSubLabel: '(לפני מע"מ)',
    group: 'pricing',
    requires: { vat: true },
    minWidth: 120,
    renderHeader: () => (
      <div>
        <div>מחיר לאחר הנחה</div>
        <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(לפני מע&quot;מ)</div>
      </div>
    ),
    renderCell: (price: PriceData, _product: ProductData | null | undefined, _settings: Settings) => {
      const vatRate = (_settings.vat_percent || 18) / 100;
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      const netPrice = grossToNet(costAfterDiscount, vatRate);
      return <span>₪{formatUnitPrice(netPrice, _settings)}</span>;
    },
  },

  pricing_unit: {
    id: 'pricing_unit',
    headerLabel: 'יחידת מידה',
    group: 'inventory',
    minWidth: 100,
    renderHeader: () => <span>יחידת מידה</span>,
    renderCell: (_price: PriceData, product: ProductData | null | undefined) => {
      return <span>{formatPricingUnit(product?.unit)}</span>;
    },
  },

  quantity_per_carton: {
    id: 'quantity_per_carton',
    headerLabel: 'כמות באריזה',
    group: 'inventory',
    minWidth: 120,
    renderHeader: () => <span>כמות באריזה</span>,
    renderCell: (price: PriceData, product: ProductData | null | undefined) => {
      const packageQty = getPackageQuantity(price, product);
      return <span>{packageQty} יח`</span>;
    },
  },

  package_type: {
    id: 'package_type',
    headerLabel: 'סוג אריזה',
    group: 'inventory',
    minWidth: 120,
    renderHeader: () => <span>סוג אריזה</span>,
    renderCell: (price: PriceData) => {
      return <span>{formatPackageType(price.package_type)}</span>;
    },
  },

  vat_rate: {
    id: 'vat_rate',
    headerLabel: 'שיעור מע"מ',
    group: 'pricing',
    minWidth: 95,
    align: 'center',
    renderHeader: () => <span>שיעור מע&quot;מ</span>,
    renderCell: (price: PriceData) => {
      if (price.vat_rate === null || price.vat_rate === undefined) return <span>-</span>;
      return <span className="text-center">{Number(price.vat_rate).toFixed(1)}%</span>;
    },
  },

  carton_price: {
    id: 'carton_price',
    headerLabel: 'מחיר לאריזה',
    tooltip: 'מחיר עלות כולל מע"מ × כמות באריזה',
    group: 'pricing',
    minWidth: 180,
    renderHeader: () => (
      <div className="flex items-center gap-1">
        <span>מחיר לאריזה</span>
        <Tooltip content="מחיר עלות כולל מע&quot;מ × כמות באריזה" />
      </div>
    ),
    renderCell: (price: PriceData, _product: ProductData | null | undefined, settings: Settings) => {
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      const packageQty = getPackageQuantity(price, _product);
      const cartonPrice = costAfterDiscount * packageQty;
      return (
        <div className="font-semibold text-base">₪{formatUnitPrice(cartonPrice, settings)}</div>
      );
    },
  },

  sell_price: {
    id: 'sell_price',
    headerLabel: 'מחיר מכירה',
    tooltip: 'מחיר מכירה = מחיר עלות (אחרי הנחה) + רווח + מע"מ',
    group: 'pricing',
    minWidth: 100,
    renderHeader: () => (
      <div className="flex items-center gap-1">
        <span>מחיר מכירה</span>
        <Tooltip content="מחיר מכירה = מחיר עלות (אחרי הנחה) + רווח + מע&quot;מ" />
      </div>
    ),
    renderCell: (price: PriceData, _product: ProductData | null | undefined, settings: Settings) => {
      if (!price.sell_price) return <span>-</span>;
      return (
        <span className="font-bold text-primary">₪{formatUnitPrice(Number(price.sell_price), settings)}</span>
      );
    },
  },

  profit_amount: {
    id: 'profit_amount',
    headerLabel: 'סכום רווח',
    group: 'pricing',
    requires: { margin: true },
    minWidth: 100,
    renderHeader: () => <span>סכום רווח</span>,
    renderCell: (price: PriceData, _product: ProductData | null | undefined, settings: Settings) => {
      if (!price.sell_price) return <span>-</span>;
      const profit = calculateProfitAmount(Number(price.sell_price), Number(price.cost_price_after_discount || price.cost_price));
      return <span>₪{formatUnitPrice(profit, settings)}</span>;
    },
  },

  profit_percent: {
    id: 'profit_percent',
    headerLabel: 'אחוז רווח',
    group: 'pricing',
    requires: { margin: true },
    minWidth: 100,
    align: 'center',
    renderHeader: () => <span>אחוז רווח</span>,
    renderCell: (price: PriceData) => {
      if (!price.sell_price || !price.margin_percent) return <span>-</span>;
      return <span className="text-center">{Number(price.margin_percent).toFixed(1)}%</span>;
    },
  },

  date: {
    id: 'date',
    headerLabel: 'תאריך עדכון',
    group: 'metadata',
    minWidth: 100,
    renderHeader: () => <span>תאריך עדכון</span>,
    renderCell: (price: PriceData) => {
      if (!price.created_at) return <span className="text-center">-</span>;
      return (
        <span className="text-sm text-muted-foreground whitespace-nowrap text-center">
          {new Date(price.created_at).toLocaleDateString('he-IL')}
        </span>
      );
    },
  },

  actions: {
    id: 'actions',
    headerLabel: 'פעולות',
    group: 'metadata',
    minWidth: 140,
    renderHeader: () => <span>פעולות</span>,
    renderCell: () => null, // Actions are rendered separately
  },
};

/**
 * Default column order
 */
export const DEFAULT_COLUMN_ORDER: ColumnId[] = [
  'supplier',
  'cost_gross',
  'cost_net',
  'discount',
  'cost_after_discount_gross',
  'cost_after_discount_net',
  'pricing_unit',
  'quantity_per_carton',
  'package_type',
  'vat_rate',
  'carton_price',
  'sell_price',
  'date',
  'actions',
];

/**
 * Default visible columns (all except optional ones)
 */
export const DEFAULT_VISIBLE_COLUMNS: Record<ColumnId, boolean> = {
  supplier: true,
  cost_gross: true,
  cost_net: true,
  discount: true,
  cost_after_discount_gross: true,
  cost_after_discount_net: true,
  pricing_unit: false,
  quantity_per_carton: true,
  package_type: false,
  vat_rate: false,
  carton_price: true,
  sell_price: true,
  profit_amount: false,
  profit_percent: false,
  date: true,
  actions: true,
};
