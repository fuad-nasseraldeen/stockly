-- Migration 0020: Add package_quantity to price_entries
-- Package quantity is supplier-specific (same product can have different package quantities per supplier)

-- Add package_quantity column to price_entries table
ALTER TABLE price_entries
ADD COLUMN IF NOT EXISTS package_quantity numeric(10, 2) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN price_entries.package_quantity IS 'כמות יחידות באריזה/קרטון - תלוי בספק. אם NULL, נחשב כ-1';

-- Update product_supplier_current_price view to include package_quantity
-- Note: product_price_summary depends on product_supplier_current_price, so we drop it first
DROP VIEW IF EXISTS product_price_summary CASCADE;
DROP VIEW IF EXISTS product_supplier_current_price CASCADE;

CREATE VIEW product_supplier_current_price AS
SELECT DISTINCT ON (pe.tenant_id, pe.product_id, pe.supplier_id)
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

-- Recreate product_price_summary (it depends on product_supplier_current_price)
CREATE VIEW product_price_summary AS
SELECT
  c.tenant_id,
  c.product_id,
  MIN(COALESCE(c.cost_price_after_discount, c.cost_price)) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM product_supplier_current_price c
GROUP BY c.tenant_id, c.product_id;

-- Add comments for documentation
COMMENT ON VIEW product_supplier_current_price IS 'מחירים עדכניים לכל מוצר-ספק, כולל כמות יחידות באריזה (תלוי בספק)';
COMMENT ON VIEW product_price_summary IS 'סיכום מחירים למוצר - מחיר נמוך ביותר לוקח בחשבון הנחות (cost_price_after_discount)';