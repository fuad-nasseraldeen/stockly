-- Stock tracking per (tenant, product, supplier). Feature-flagged via settings.stock_tracking_enabled (default off).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS stock_tracking_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS product_supplier_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  stock_quantity numeric(14, 4) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_threshold numeric(14, 4) NOT NULL DEFAULT 0 CHECK (min_threshold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS product_supplier_stock_tenant_product_supplier_idx
  ON product_supplier_stock (tenant_id, product_id, supplier_id);

CREATE INDEX IF NOT EXISTS product_supplier_stock_tenant_qty_idx
  ON product_supplier_stock (tenant_id, stock_quantity);

CREATE INDEX IF NOT EXISTS product_supplier_stock_alert_candidate_idx
  ON product_supplier_stock (tenant_id)
  WHERE min_threshold > 0;

COMMENT ON TABLE product_supplier_stock IS 'Per supplier stock level for a product; alerts derived as stock_quantity < min_threshold when min_threshold > 0';

-- Serialized update: INSERT shell row if missing, SELECT FOR UPDATE, optional optimistic version check, UPDATE.
CREATE OR REPLACE FUNCTION public.set_product_supplier_stock(
  p_tenant_id uuid,
  p_product_id uuid,
  p_supplier_id uuid,
  p_stock_quantity numeric,
  p_apply_min_threshold boolean DEFAULT false,
  p_min_threshold numeric DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS product_supplier_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r product_supplier_stock;
  v_min numeric(14, 4);
BEGIN
  IF p_stock_quantity < 0 THEN
    RAISE EXCEPTION 'invalid_stock_quantity' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = p_product_id AND p.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM suppliers s
    WHERE s.id = p_supplier_id AND s.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO product_supplier_stock (tenant_id, product_id, supplier_id, stock_quantity, min_threshold)
  VALUES (p_tenant_id, p_product_id, p_supplier_id, 0, 0)
  ON CONFLICT (tenant_id, product_id, supplier_id) DO NOTHING;

  SELECT *
  INTO r
  FROM product_supplier_stock
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_row_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND r.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stock_version_conflict' USING ERRCODE = 'P0001';
  END IF;

  v_min := r.min_threshold;
  IF p_apply_min_threshold THEN
    v_min := COALESCE(p_min_threshold, 0);
    IF v_min < 0 THEN
      RAISE EXCEPTION 'invalid_min_threshold' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE product_supplier_stock
  SET
    stock_quantity = p_stock_quantity,
    min_threshold = v_min,
    updated_at = now()
  WHERE id = r.id
  RETURNING * INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_supplier_stock(uuid, uuid, uuid, numeric, boolean, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_product_supplier_stock(uuid, uuid, uuid, numeric, boolean, numeric, timestamptz) TO service_role;

-- Derived low-stock list (no alerts table); efficient filter on tenant + threshold.
CREATE OR REPLACE FUNCTION public.list_low_stock(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_critical_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  product_id uuid,
  supplier_id uuid,
  stock_quantity numeric,
  min_threshold numeric,
  updated_at timestamptz,
  product_name text,
  supplier_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pss.id,
    pss.product_id,
    pss.supplier_id,
    pss.stock_quantity,
    pss.min_threshold,
    pss.updated_at,
    p.name::text AS product_name,
    s.name::text AS supplier_name
  FROM product_supplier_stock pss
  INNER JOIN products p ON p.id = pss.product_id AND p.tenant_id = pss.tenant_id
  INNER JOIN suppliers s ON s.id = pss.supplier_id AND s.tenant_id = pss.tenant_id
  WHERE pss.tenant_id = p_tenant_id
    AND pss.min_threshold > 0
    AND pss.stock_quantity < pss.min_threshold
    AND (NOT p_critical_only OR pss.stock_quantity <= 0)
    AND (
      p_search IS NULL
      OR btrim(p_search) = ''
      OR p.name ILIKE '%' || btrim(p_search) || '%'
      OR s.name ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY pss.stock_quantity ASC, p.name ASC, s.name ASC;
$$;

REVOKE ALL ON FUNCTION public.list_low_stock(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_low_stock(uuid, text, boolean) TO service_role;

ALTER TABLE product_supplier_stock ENABLE ROW LEVEL SECURITY;

-- Idempotent: safe to re-run after a partial run (Supabase / manual re-exec).
DROP POLICY IF EXISTS "Members can read product_supplier_stock" ON product_supplier_stock;
DROP POLICY IF EXISTS "Members can insert product_supplier_stock" ON product_supplier_stock;
DROP POLICY IF EXISTS "Members can update product_supplier_stock" ON product_supplier_stock;
DROP POLICY IF EXISTS "Members can delete product_supplier_stock" ON product_supplier_stock;

CREATE POLICY "Members can read product_supplier_stock"
  ON product_supplier_stock FOR SELECT
  USING (is_member(tenant_id));

CREATE POLICY "Members can insert product_supplier_stock"
  ON product_supplier_stock FOR INSERT
  WITH CHECK (is_member(tenant_id));

CREATE POLICY "Members can update product_supplier_stock"
  ON product_supplier_stock FOR UPDATE
  USING (is_member(tenant_id))
  WITH CHECK (is_member(tenant_id));

CREATE POLICY "Members can delete product_supplier_stock"
  ON product_supplier_stock FOR DELETE
  USING (is_member(tenant_id));
