-- Low-stock alerts: include rows where stock is at or below the threshold (not only strictly below).

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
    AND pss.stock_quantity <= pss.min_threshold
    AND (NOT p_critical_only OR pss.stock_quantity <= 0)
    AND (
      p_search IS NULL
      OR btrim(p_search) = ''
      OR p.name ILIKE '%' || btrim(p_search) || '%'
      OR s.name ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY pss.stock_quantity ASC, p.name ASC, s.name ASC;
$$;

COMMENT ON TABLE public.product_supplier_stock IS 'Per supplier stock level for a product; alerts derived as stock_quantity <= min_threshold when min_threshold > 0';

REVOKE ALL ON FUNCTION public.list_low_stock(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_low_stock(uuid, text, boolean) TO service_role;
