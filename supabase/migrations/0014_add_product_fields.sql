-- Migration 0014: Add product fields (SKU, package quantity, discount, price after discount)
-- Adds: sku, package_quantity to products table
-- Adds: discount_percent, cost_price_after_discount to price_entries table

-- Add SKU and package quantity to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS sku text,
ADD COLUMN IF NOT EXISTS package_quantity numeric(10,2) DEFAULT 1 CHECK (package_quantity > 0);

-- Add index for SKU lookup (optional, but useful for searching)
CREATE INDEX IF NOT EXISTS products_sku_idx ON products (tenant_id, sku) WHERE sku IS NOT NULL;

-- Add discount and price after discount to price_entries table
ALTER TABLE price_entries
ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
ADD COLUMN IF NOT EXISTS cost_price_after_discount numeric(10,2) CHECK (cost_price_after_discount IS NULL OR cost_price_after_discount >= 0);

-- Create index for discount queries (optional)
CREATE INDEX IF NOT EXISTS price_entries_discount_idx ON price_entries (tenant_id, discount_percent) WHERE discount_percent > 0;

-- Drop and recreate views to include new fields
-- Note: product_price_summary depends on product_supplier_current_price, so we drop it first
DROP VIEW IF EXISTS product_price_summary CASCADE;
DROP VIEW IF EXISTS product_supplier_current_price CASCADE;

-- Recreate product_supplier_current_price with new fields
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
  pe.created_at
FROM price_entries pe
ORDER BY pe.tenant_id, pe.product_id, pe.supplier_id, pe.created_at DESC;

-- Recreate product_price_summary (it depends on product_supplier_current_price)
CREATE VIEW product_price_summary AS
SELECT
  c.tenant_id,
  c.product_id,
  MIN(c.cost_price) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM product_supplier_current_price c
GROUP BY c.tenant_id, c.product_id;

-- Add comment for documentation
COMMENT ON COLUMN products.sku IS 'מק"ט / ברקוד של המוצר';
COMMENT ON COLUMN products.package_quantity IS 'כמות יחידות באריזה (למשל: 6 יחידות באריזה)';
COMMENT ON COLUMN price_entries.discount_percent IS 'אחוז הנחה מספק (0-100)';
COMMENT ON COLUMN price_entries.cost_price_after_discount IS 'מחיר עלות לאחר הנחה (cost_price * (1 - discount_percent/100))';
