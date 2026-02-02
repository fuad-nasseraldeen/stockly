/**
 * Price Table Column Registry
 * 
 * Defines all possible columns for price tables.
 * Columns are filtered and ordered based on settings and user layout preferences.
 */

import { Tooltip } from '../components/ui/tooltip';
import { grossToNet, calculateProfitAmount } from './pricing-rules';
import * as React from 'react';

export type ColumnId =
  | 'supplier'
  | 'cost_gross'
  | 'cost_net'
  | 'discount'
  | 'cost_after_discount_gross'
  | 'cost_after_discount_net'
  | 'quantity_per_carton'
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
  renderCell: (price: any, product: any, settings: any) => React.ReactNode;
};

export type PriceData = {
  cost_price: number; // Always gross (with VAT if VAT enabled)
  cost_price_after_discount?: number | null; // Always gross
  discount_percent?: number | null;
  package_quantity?: number | null;
  sell_price?: number;
  margin_percent?: number | null;
  supplier_id: string;
  supplier_name?: string;
  created_at: string;
};

export type ProductData = {
  package_quantity?: number | null;
};

export type Settings = {
  use_vat?: boolean;
  use_margin?: boolean;
  vat_percent?: number;
  global_margin_percent?: number;
};

/**
 * Get package quantity: first from price (supplier-specific), then product, then default to 1
 */
function getPackageQuantity(price: PriceData, product: ProductData): number {
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
    headerSubLabel: '(כולל מע"מ)',
    tooltip: 'מחיר עלות כולל מע"מ',
    group: 'pricing',
    minWidth: 100,
    renderHeader: () => (
      <div className="flex items-center gap-1">
        <span>מחיר עלות</span>
        <Tooltip content="מחיר עלות כולל מע&quot;מ" />
      </div>
    ),
    renderCell: (price: PriceData) => (
      <span>₪{Number(price.cost_price).toFixed(2)}</span>
    ),
  },

  cost_net: {
    id: 'cost_net',
    headerLabel: 'מחיר לפני מע"מ',
    group: 'pricing',
    requires: { vat: true },
    minWidth: 120,
    renderHeader: () => <span>מחיר לפני מע&quot;מ</span>,
    renderCell: (price: PriceData, _product: ProductData, _settings: Settings) => {
      const vatRate = (_settings.vat_percent || 18) / 100;
      const netPrice = grossToNet(Number(price.cost_price), vatRate);
      return <span>₪{netPrice.toFixed(2)}</span>;
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
    headerLabel: 'מחיר לאחר הנחה',
    headerSubLabel: '(כולל מע"מ)',
    group: 'pricing',
    minWidth: 120,
    renderHeader: () => (
      <div>
        <div>מחיר לאחר הנחה</div>
        <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(כולל מע&quot;מ)</div>
      </div>
    ),
    renderCell: (price: PriceData) => {
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      return <span>₪{costAfterDiscount.toFixed(2)}</span>;
    },
  },

  cost_after_discount_net: {
    id: 'cost_after_discount_net',
    headerLabel: 'מחיר לאחר הנחה',
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
    renderCell: (price: PriceData, _product: ProductData, _settings: Settings) => {
      const vatRate = (_settings.vat_percent || 18) / 100;
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      const netPrice = grossToNet(costAfterDiscount, vatRate);
      return <span>₪{netPrice.toFixed(2)}</span>;
    },
  },

  quantity_per_carton: {
    id: 'quantity_per_carton',
    headerLabel: 'כמות בקרטון',
    group: 'inventory',
    minWidth: 120,
    renderHeader: () => <span>כמות בקרטון</span>,
    renderCell: (price: PriceData, product: ProductData) => {
      const packageQty = getPackageQuantity(price, product);
      return <span>{packageQty} יח\`</span>;
    },
  },

  carton_price: {
    id: 'carton_price',
    headerLabel: 'מחיר לקרטון',
    tooltip: 'מחיר עלות כולל מע"מ × כמות בקרטון',
    group: 'pricing',
    minWidth: 180,
    renderHeader: () => (
      <div className="flex items-center gap-1">
        <span>מחיר לקרטון</span>
        <Tooltip content="מחיר עלות כולל מע&quot;מ × כמות בקרטון" />
      </div>
    ),
    renderCell: (price: PriceData, _product: ProductData, _settings: Settings) => {
      const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
      const packageQty = getPackageQuantity(price, _product);
      const cartonPrice = costAfterDiscount * packageQty;
      return (
        <div className="font-semibold text-base">₪{cartonPrice.toFixed(2)}</div>
      );
    },
  },

  sell_price: {
    id: 'sell_price',
    headerLabel: 'מחיר מכירה',
    tooltip: 'מחיר עלות + מע"מ + רווח',
    group: 'pricing',
    requires: { margin: true },
    minWidth: 100,
    renderHeader: () => (
      <div className="flex items-center gap-1">
        <span>מחיר מכירה</span>
        <Tooltip content="מחיר עלות + מע&quot;מ + רווח" />
      </div>
    ),
    renderCell: (price: PriceData) => {
      if (!price.sell_price) return <span>-</span>;
      return (
        <span className="font-bold text-primary">₪{Number(price.sell_price).toFixed(2)}</span>
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
    renderCell: (price: PriceData) => {
      if (!price.sell_price) return <span>-</span>;
      const profit = calculateProfitAmount(Number(price.sell_price), Number(price.cost_price_after_discount || price.cost_price));
      return <span>₪{profit.toFixed(2)}</span>;
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
  'quantity_per_carton',
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
  quantity_per_carton: true,
  carton_price: true,
  sell_price: true,
  profit_amount: false,
  profit_percent: false,
  date: true,
  actions: true,
};
