/**
 * Canonical query keys for table layout preferences
 * 
 * CRITICAL: These are the ONLY query keys used for table layout preferences.
 * All hooks and components MUST use these keys to ensure cache consistency.
 * 
 * These keys include tenantId to ensure tenant-scoped cache isolation.
 */

/**
 * Get the canonical query key for products table layout preference
 * 
 * @param tenantId - The tenant ID (from TenantContext)
 * @returns The canonical query key: ['settings', 'preferences', 'table_layout_productsTable', tenantId]
 */
export function getTableLayoutProductsKey(tenantId: string) {
  return ['settings', 'preferences', 'table_layout_productsTable', tenantId] as const;
}

/**
 * Get the canonical query key for price history table layout preference
 * 
 * @param tenantId - The tenant ID (from TenantContext)
 * @returns The canonical query key: ['settings', 'preferences', 'table_layout_priceHistoryTable', tenantId]
 */
export function getTableLayoutPriceHistoryKey(tenantId: string) {
  return ['settings', 'preferences', 'table_layout_priceHistoryTable', tenantId] as const;
}
