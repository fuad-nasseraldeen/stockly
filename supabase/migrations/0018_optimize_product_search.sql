-- Migration 0018: Optimize product search performance
-- Adds RPC function for paginated search, SKU trigram index, and price_entries indexes

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add SKU trigram index for fast SKU search (ILIKE '%term%' and trigram %)
CREATE INDEX IF NOT EXISTS products_sku_trgm_idx
  ON products
  USING gin (sku gin_trgm_ops)
  WHERE is_active = true AND sku IS NOT NULL;

-- Ensure name_norm has trigram index (should exist from 0008, but ensure it's there)
CREATE INDEX IF NOT EXISTS products_name_norm_trgm_idx
  ON products
  USING gin (name_norm gin_trgm_ops)
  WHERE is_active = true;

-- Add indexes for price_entries lookups (critical for views performance)
-- Index for "latest price per product+supplier" lookups
CREATE INDEX IF NOT EXISTS price_entries_lookup_idx
  ON price_entries (tenant_id, product_id, supplier_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Index for product-level price lookups
CREATE INDEX IF NOT EXISTS price_entries_product_idx
  ON price_entries (tenant_id, product_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- RPC function for paginated product search with sorting
-- This function returns only the product IDs for the current page + total count
-- This is MUCH faster than loading all products and sorting in Node
-- Uses trigram operators (%) for fuzzy search on longer terms (>= 3 chars)
CREATE OR REPLACE FUNCTION public.products_list_page(
  tenant_uuid uuid,
  search_text text DEFAULT NULL,
  supplier_uuid uuid DEFAULT NULL,
  category_uuid uuid DEFAULT NULL,
  sort_text text DEFAULT 'updated_desc',
  limit_results int DEFAULT 10,
  offset_results int DEFAULT 0
)
RETURNS TABLE (
  product_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Note: Tenant access is validated by backend middleware (requireTenant)
  -- We trust the tenant_uuid parameter here since it comes from authenticated backend
  -- If you want additional security, you can uncomment the check below, but it requires
  -- the backend to pass JWT context to Supabase (which it currently doesn't)
  
  -- IF NOT EXISTS (
  --   SELECT 1 FROM memberships
  --   WHERE tenant_id = tenant_uuid
  --     AND user_id = auth.uid()
  -- ) THEN
  --   RAISE EXCEPTION 'Access denied: not a member of this tenant';
  -- END IF;

  RETURN QUERY
  WITH base AS (
    SELECT 
      p.id,
      p.name_norm,
      p.sku,
      s.min_current_cost_price,
      s.min_current_sell_price,
      s.last_price_update_at,
      p.created_at as product_created_at,
      -- Calculate similarity for ordering (only if search exists and >= 3 chars)
      CASE 
        WHEN search_text IS NOT NULL AND search_text != '' AND length(search_text) >= 3
        THEN similarity(p.name_norm, search_text)
        ELSE NULL
      END as name_sim,
      CASE 
        WHEN search_text IS NOT NULL AND search_text != '' AND length(search_text) >= 3 AND p.sku IS NOT NULL
        THEN similarity(p.sku, search_text)
        ELSE NULL
      END as sku_sim
    FROM products p
    LEFT JOIN product_price_summary s
      ON s.tenant_id = p.tenant_id AND s.product_id = p.id
    WHERE p.tenant_id = tenant_uuid
      AND p.is_active = true
      AND (category_uuid IS NULL OR p.category_id = category_uuid)
      AND (
        -- No search: return all
        search_text IS NULL OR search_text = ''
        OR
        -- Short search (1-2 chars): use ILIKE (substring match)
        -- For very short searches, ILIKE is more reliable than trigram
        (
          length(search_text) <= 2 AND (
            p.name_norm ILIKE ('%' || search_text || '%')
            OR (p.sku IS NOT NULL AND p.sku ILIKE ('%' || search_text || '%'))
          )
        )
        OR
        -- Long search (>= 3 chars): use both trigram operator (%) AND ILIKE
        -- Trigram for fuzzy matching (catches typos), ILIKE for exact substring
        (
          length(search_text) >= 3 AND (
            -- Try trigram first (fuzzy match - catches typos like "קנדר" -> "קינדר")
            p.name_norm % search_text
            -- OR exact substring match (catches partial words like "השוק" in "מאפיית השוק")
            OR p.name_norm ILIKE ('%' || search_text || '%')
            -- Same for SKU
            OR (p.sku IS NOT NULL AND (
              p.sku % search_text
              OR p.sku ILIKE ('%' || search_text || '%')
            ))
          )
        )
      )
      AND (
        supplier_uuid IS NULL OR EXISTS (
          SELECT 1
          FROM product_supplier_current_price c
          WHERE c.tenant_id = p.tenant_id
            AND c.product_id = p.id
            AND c.supplier_id = supplier_uuid
        )
      )
  )
  SELECT 
    base.id as product_id,
    count(*) OVER() as total_count
  FROM base
  ORDER BY
    -- When searching, order by exact match first, then similarity
    -- Exact substring matches come first (using base columns)
    CASE 
      WHEN search_text IS NOT NULL AND search_text != '' AND (
        base.name_norm ILIKE ('%' || search_text || '%')
        OR (base.sku IS NOT NULL AND base.sku ILIKE ('%' || search_text || '%'))
      )
      THEN 0
      ELSE 1
    END ASC,
    -- Then by similarity (most relevant results first)
    CASE 
      WHEN search_text IS NOT NULL AND search_text != '' AND length(search_text) >= 3
      THEN GREATEST(COALESCE(base.name_sim, 0), COALESCE(base.sku_sim, 0))
      ELSE NULL
    END DESC NULLS LAST,
    -- Then apply requested sort
    CASE 
      WHEN sort_text = 'price_asc' THEN base.min_current_cost_price 
      ELSE NULL 
    END ASC NULLS LAST,
    CASE 
      WHEN sort_text = 'price_desc' THEN base.min_current_cost_price 
      ELSE NULL 
    END DESC NULLS LAST,
    CASE 
      WHEN sort_text = 'updated_asc' THEN COALESCE(base.last_price_update_at, base.product_created_at) 
      ELSE NULL 
    END ASC NULLS LAST,
    CASE 
      WHEN sort_text = 'updated_desc' THEN COALESCE(base.last_price_update_at, base.product_created_at) 
      ELSE NULL 
    END DESC NULLS LAST,
    base.id  -- Final tie-breaker for consistent ordering
  LIMIT limit_results
  OFFSET offset_results;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.products_list_page TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.products_list_page IS 'Returns paginated product IDs with total count for fast product listing. Handles search, filtering, and sorting in the database.';
