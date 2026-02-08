-- Migration 0023: Change cost_price precision from 2 to 4 decimal places
-- This allows storing unit prices with 4 decimal places (e.g., 0.1350)
-- Carton prices will still be displayed with 2 decimal places (calculated from unit price * quantity)

-- Drop views that depend on cost_price column
DROP VIEW IF EXISTS product_price_summary CASCADE;
DROP VIEW IF EXISTS product_supplier_current_price CASCADE;
DROP VIEW IF EXISTS product_current_price CASCADE;

-- Alter the cost_price column to support 4 decimal places
ALTER TABLE price_entries 
  ALTER COLUMN cost_price TYPE numeric(10,4);

-- Also update cost_price_after_discount to 4 decimal places for consistency
ALTER TABLE price_entries 
  ALTER COLUMN cost_price_after_discount TYPE numeric(10,4);

-- Recreate product_supplier_current_price view
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
  pe.created_at
FROM price_entries pe
ORDER BY pe.tenant_id, pe.product_id, pe.supplier_id, pe.created_at DESC;

-- Recreate product_price_summary view (depends on product_supplier_current_price)
CREATE VIEW product_price_summary AS
SELECT
  c.tenant_id,
  c.product_id,
  MIN(COALESCE(c.cost_price_after_discount, c.cost_price)) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM product_supplier_current_price c
GROUP BY c.tenant_id, c.product_id;

-- Recreate product_current_price view if it exists (check from schema)
CREATE VIEW product_current_price AS
SELECT DISTINCT ON (pe.tenant_id, pe.product_id)
  pe.tenant_id,
  pe.product_id,
  pe.cost_price,
  pe.sell_price,
  pe.created_at
FROM price_entries pe
ORDER BY pe.tenant_id, pe.product_id, pe.created_at DESC;

-- Update the comments to reflect the change
COMMENT ON COLUMN price_entries.cost_price IS 'Cost price per unit with 4 decimal places precision';
COMMENT ON COLUMN price_entries.cost_price_after_discount IS 'Cost price per unit after discount with 4 decimal places precision';
