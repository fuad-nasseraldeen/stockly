-- Migration 0029:
-- 1) Add tenant-level decimal precision setting (default: 2)
-- 2) Expand numeric scales for price fields so precision >2 can be stored safely

-- product_supplier_current_price depends on price_entries numeric columns,
-- so drop dependent views before altering column types.
DROP VIEW IF EXISTS product_price_summary CASCADE;
DROP VIEW IF EXISTS product_supplier_current_price CASCADE;
DROP VIEW IF EXISTS product_current_price CASCADE;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS decimal_precision smallint NOT NULL DEFAULT 2;

UPDATE settings
SET decimal_precision = 2
WHERE decimal_precision IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_decimal_precision_check'
  ) THEN
    ALTER TABLE settings
      ADD CONSTRAINT settings_decimal_precision_check
      CHECK (decimal_precision BETWEEN 0 AND 8);
  END IF;
END $$;

ALTER TABLE price_entries
  ALTER COLUMN cost_price TYPE numeric(14,8),
  ALTER COLUMN cost_price_after_discount TYPE numeric(14,8),
  ALTER COLUMN sell_price TYPE numeric(14,8),
  ALTER COLUMN package_quantity TYPE numeric(14,8);

ALTER TABLE products
  ALTER COLUMN package_quantity TYPE numeric(14,8);

-- Recreate views after type changes (same definition as migration 0028).
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

CREATE VIEW product_price_summary AS
SELECT
  c.tenant_id,
  c.product_id,
  MIN(COALESCE(c.cost_price_after_discount, c.cost_price)) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM product_supplier_current_price c
GROUP BY c.tenant_id, c.product_id;

CREATE VIEW product_current_price AS
SELECT DISTINCT ON (pe.tenant_id, pe.product_id)
  pe.tenant_id,
  pe.product_id,
  pe.cost_price,
  pe.sell_price,
  pe.created_at
FROM price_entries pe
ORDER BY pe.tenant_id, pe.product_id, pe.created_at DESC;
