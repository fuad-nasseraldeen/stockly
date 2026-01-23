-- Stockly - Add required views + settings singleton (VAT)
-- This migration is additive and safe to run on new or existing DBs.

-- ============================================
-- SETTINGS (singleton)
-- ============================================

CREATE TABLE IF NOT EXISTS public.settings (
  id integer PRIMARY KEY CHECK (id = 1),
  vat_percent numeric(5,2) NOT NULL DEFAULT 18.00 CHECK (vat_percent >= 0 AND vat_percent <= 100),
  updated_at timestamptz DEFAULT now()
);

-- Ensure singleton row exists
INSERT INTO public.settings (id, vat_percent)
SELECT 1, 18.00
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE id = 1);

-- Enable RLS + "authenticated can all" policies (consistent with rest of schema)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.settings';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can insert settings" ON public.settings';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can update settings" ON public.settings';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can delete settings" ON public.settings';
END $$;

CREATE POLICY "Authenticated users can read settings"
  ON public.settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert settings"
  ON public.settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update settings"
  ON public.settings FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete settings"
  ON public.settings FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================
-- VIEWS
-- ============================================

-- Current price per (product, supplier): latest price_entries row per pair
CREATE OR REPLACE VIEW public.product_supplier_current_price AS
SELECT DISTINCT ON (pe.product_id, pe.supplier_id)
  pe.product_id,
  pe.supplier_id,
  pe.cost_price,
  pe.margin_percent,
  pe.sell_price,
  pe.created_at
FROM public.price_entries pe
ORDER BY pe.product_id, pe.supplier_id, pe.created_at DESC;

-- Summary per product for sorting/filtering:
-- - min current cost/sell across suppliers
-- - last price update timestamp (max created_at)
CREATE OR REPLACE VIEW public.product_price_summary AS
SELECT
  c.product_id,
  MIN(c.cost_price) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM public.product_supplier_current_price c
GROUP BY c.product_id;

