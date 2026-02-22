-- Migration 0028: Refresh current-price view to include package metadata fields
-- Fixes environments where price_entries has package_type but product_supplier_current_price view was not refreshed.

-- Drop dependent summary first, then recreate both views.
DROP VIEW IF EXISTS product_price_summary CASCADE;
DROP VIEW IF EXISTS product_supplier_current_price CASCADE;

-- Recreate product_supplier_current_price with extended package metadata columns.
CREATE VIEW product_supplier_current_price AS
SELECT DISTINCT ON (pe.tenant_id, pe.product_id, pe.supplier_id)
  pe.id,
  pe.tenant_id,
  pe.product_id,
  pe.supplier_id,
  pe.cost_price,
  pe.discount_percent,
  pe.cost_price_after_discount,
  pe.margin_percent,
  pe.sell_price,
  pe.package_quantity,
  pe.package_type,
  pe.source_price_includes_vat,
  pe.vat_rate,
  pe.effective_from,
  pe.created_at
FROM price_entries pe
ORDER BY pe.tenant_id, pe.product_id, pe.supplier_id, pe.created_at DESC;

-- Recreate summary view that depends on product_supplier_current_price.
CREATE VIEW product_price_summary AS
SELECT
  c.tenant_id,
  c.product_id,
  MIN(COALESCE(c.cost_price_after_discount, c.cost_price)) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM product_supplier_current_price c
GROUP BY c.tenant_id, c.product_id;

COMMENT ON VIEW product_supplier_current_price IS 'מחירים עדכניים לכל מוצר-ספק כולל package_type ומטא-דאטה לייבוא';
COMMENT ON VIEW product_price_summary IS 'סיכום מחירים למוצר - מחיר נמוך ביותר לוקח בחשבון הנחות';
