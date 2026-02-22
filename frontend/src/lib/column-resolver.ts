/**
 * Column Resolver
 * 
 * Filters and orders columns based on settings and user layout preferences.
 */

import { ColumnId, ColumnDefinition, PRICE_COLUMN_REGISTRY, DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from './price-columns';

export type Settings = {
  use_vat?: boolean;
  use_margin?: boolean;
  vat_percent?: number;
  global_margin_percent?: number;
  decimal_precision?: number | null;
};

export type ColumnLayout = {
  visible: Record<ColumnId, boolean>;
  order: ColumnId[];
  widths?: Record<ColumnId, number>;
};

/**
 * Resolve which columns should be displayed and in what order
 */
export function resolveColumns(
  settings: Settings,
  layout?: Partial<ColumnLayout>
): ColumnDefinition[] {
  const vatEnabled = true; // use_vat is deprecated: VAT mode is always enabled
  const marginEnabled = settings.use_margin === true;

  // Step 1: Filter columns based on requirements
  const availableColumns = Object.values(PRICE_COLUMN_REGISTRY).filter((col) => {
    // Check VAT requirement
    if (col.requires?.vat && !vatEnabled) {
      return false;
    }

    // Check margin requirement
    if (col.requires?.margin && !marginEnabled) {
      return false;
    }

    return true;
  });

  // Step 2: Apply user layout preferences
  const userOrder = layout?.order || DEFAULT_COLUMN_ORDER;
  const userVisible = layout?.visible || DEFAULT_VISIBLE_COLUMNS;

  // Create a map for quick lookup
  const columnMap = new Map(availableColumns.map((col) => [col.id, col]));

  // Order columns according to user preference, then append any missing ones
  const orderedColumns: ColumnDefinition[] = [];
  const processedIds = new Set<ColumnId>();

  // Add columns in user-specified order
  for (const colId of userOrder) {
    const col = columnMap.get(colId);
    if (col && userVisible[colId] !== false) {
      orderedColumns.push(col);
      processedIds.add(colId);
    }
  }

  // Add any remaining columns that weren't in the user order
  for (const col of availableColumns) {
    if (!processedIds.has(col.id) && userVisible[col.id] !== false) {
      orderedColumns.push(col);
    }
  }

  return orderedColumns;
}

/**
 * Get all available columns (after capability filters, regardless of visibility)
 * Used for column management modal where all columns should be shown
 */
export function getAvailableColumns(settings: Settings): ColumnDefinition[] {
  const vatEnabled = true; // use_vat is deprecated: VAT mode is always enabled
  const marginEnabled = settings.use_margin === true;

  // Filter columns based on requirements only (not visibility)
  return Object.values(PRICE_COLUMN_REGISTRY).filter((col) => {
    // Check VAT requirement
    if (col.requires?.vat && !vatEnabled) {
      return false;
    }

    // Check margin requirement
    if (col.requires?.margin && !marginEnabled) {
      return false;
    }

    return true;
  });
}

/**
 * Get default layout based on settings
 */
export function getDefaultLayout(settings: Settings): ColumnLayout {
  const vatEnabled = true; // use_vat is deprecated: VAT mode is always enabled
  const marginEnabled = settings.use_margin === true;

  const visible: Record<ColumnId, boolean> = { ...DEFAULT_VISIBLE_COLUMNS };

  // Hide VAT columns if VAT is disabled
  if (!vatEnabled) {
    visible.cost_net = false;
    visible.cost_after_discount_net = false;
  }

  // Hide margin columns if margin is disabled
  if (!marginEnabled) {
    visible.sell_price = false;
    visible.profit_amount = false;
    visible.profit_percent = false;
  }

  // Build order including all available columns (not just visible ones)
  // Order should include all available columns, maintaining DEFAULT_COLUMN_ORDER where possible
  const availableColumns = getAvailableColumns(settings);
  const availableIds = new Set(availableColumns.map((col) => col.id));
  
  // Start with DEFAULT_COLUMN_ORDER filtered to available columns
  const order = DEFAULT_COLUMN_ORDER.filter((id) => availableIds.has(id));
  
  // Add any available columns that aren't in DEFAULT_COLUMN_ORDER
  const missingIds = availableColumns
    .map((col) => col.id)
    .filter((id) => !order.includes(id));
  
  return { visible, order: [...order, ...missingIds] };
}
