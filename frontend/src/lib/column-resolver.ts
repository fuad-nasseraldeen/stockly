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
  const vatEnabled = settings.use_vat === true;
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
 * Get default layout based on settings
 */
export function getDefaultLayout(settings: Settings): ColumnLayout {
  const vatEnabled = settings.use_vat === true;
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

  // Build order excluding hidden columns
  const order = DEFAULT_COLUMN_ORDER.filter((id) => visible[id] !== false);

  return { visible, order };
}
