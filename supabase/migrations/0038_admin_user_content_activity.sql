-- Aggregate last "content" timestamp per user in a tenant (products/categories/suppliers/price_entries created_by).
-- Called only from backend with service_role.

CREATE OR REPLACE FUNCTION public.admin_users_last_content_activity(
  p_tenant_id uuid,
  p_user_ids uuid[]
)
RETURNS TABLE(user_id uuid, last_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sub.created_by AS user_id, MAX(sub.created_at) AS last_at
  FROM (
    SELECT created_by, created_at FROM public.products
    WHERE tenant_id = p_tenant_id
      AND created_by IS NOT NULL
      AND created_by = ANY(p_user_ids)
    UNION ALL
    SELECT created_by, created_at FROM public.categories
    WHERE tenant_id = p_tenant_id
      AND created_by IS NOT NULL
      AND created_by = ANY(p_user_ids)
    UNION ALL
    SELECT created_by, created_at FROM public.suppliers
    WHERE tenant_id = p_tenant_id
      AND created_by IS NOT NULL
      AND created_by = ANY(p_user_ids)
    UNION ALL
    SELECT created_by, created_at FROM public.price_entries
    WHERE tenant_id = p_tenant_id
      AND created_by IS NOT NULL
      AND created_by = ANY(p_user_ids)
  ) sub
  GROUP BY sub.created_by;
$$;

REVOKE ALL ON FUNCTION public.admin_users_last_content_activity(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_users_last_content_activity(uuid, uuid[]) TO service_role;
