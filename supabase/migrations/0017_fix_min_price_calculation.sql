-- Migration 0017: Fix min_current_cost_price to use cost_price_after_discount when available
-- The min price should consider discounts, so we use cost_price_after_discount if it exists,
-- otherwise fall back to cost_price

-- Drop and recreate product_price_summary view
DROP VIEW IF EXISTS product_price_summary CASCADE;

-- Recreate product_price_summary with correct min price calculation
CREATE VIEW product_price_summary AS
SELECT
  c.tenant_id,
  c.product_id,
  MIN(COALESCE(c.cost_price_after_discount, c.cost_price)) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM product_supplier_current_price c
GROUP BY c.tenant_id, c.product_id;

-- Add comment for documentation
COMMENT ON VIEW product_price_summary IS 'סיכום מחירים למוצר - מחיר נמוך ביותר לוקח בחשבון הנחות (cost_price_after_discount)';
