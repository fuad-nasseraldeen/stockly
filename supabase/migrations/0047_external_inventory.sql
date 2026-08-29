-- Independent external inventory. This is intentionally separate from product_supplier_stock.

CREATE TABLE IF NOT EXISTS external_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE INDEX IF NOT EXISTS external_inventory_tenant_updated_idx
  ON external_inventory (tenant_id, updated_at DESC);

COMMENT ON TABLE external_inventory IS 'Standalone external inventory; it does not affect supplier stock, alerts, pricing, or products.';

-- Atomically adjust a product's external inventory. Reaching zero removes it from the external-inventory list.
-- Drop first so this script can also repair the first published version of this function.
DROP FUNCTION IF EXISTS public.adjust_external_inventory(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.adjust_external_inventory(
  p_tenant_id uuid,
  p_product_id uuid,
  p_delta integer
)
RETURNS TABLE (result_product_id uuid, result_quantity integer, result_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantity integer;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'invalid_inventory_delta' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products p WHERE p.id = p_product_id AND p.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Positive changes are a single atomic upsert, including the first addition.
  IF p_delta > 0 THEN
    RETURN QUERY
    WITH inserted AS (
      INSERT INTO external_inventory (tenant_id, product_id, quantity)
      VALUES (p_tenant_id, p_product_id, p_delta)
      ON CONFLICT (tenant_id, product_id) DO UPDATE
        SET quantity = external_inventory.quantity + EXCLUDED.quantity,
            updated_at = now()
      RETURNING external_inventory.product_id, external_inventory.quantity, external_inventory.updated_at
    )
    SELECT inserted.product_id, inserted.quantity, inserted.updated_at FROM inserted;
    RETURN;
  END IF;

  SELECT ei.quantity INTO v_quantity
  FROM external_inventory ei
  WHERE ei.tenant_id = p_tenant_id AND ei.product_id = p_product_id
  FOR UPDATE;

  -- A negative adjustment of a product that is not in the list leaves it absent.
  IF NOT FOUND THEN RETURN; END IF;

  v_quantity := GREATEST(v_quantity + p_delta, 0);

  IF v_quantity = 0 THEN
    DELETE FROM external_inventory
    WHERE tenant_id = p_tenant_id AND product_id = p_product_id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH updated AS (
    UPDATE external_inventory
    SET quantity = v_quantity, updated_at = now()
    WHERE external_inventory.tenant_id = p_tenant_id AND external_inventory.product_id = p_product_id
    RETURNING external_inventory.product_id, external_inventory.quantity, external_inventory.updated_at
  )
  SELECT updated.product_id, updated.quantity, updated.updated_at FROM updated;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_external_inventory(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_external_inventory(uuid, uuid, integer) TO service_role;

ALTER TABLE external_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read external_inventory" ON external_inventory;
CREATE POLICY "Members can read external_inventory"
  ON external_inventory FOR SELECT
  USING (is_member(tenant_id));
