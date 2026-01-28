-- Migration 0008: Fuzzy product search with pg_trgm
-- Enables tolerant search on product names (handles small typos)

-- Ensure pg_trgm extension is available - קודם תריץ זה לבד 
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on normalized product name for fast similarity search
CREATE INDEX IF NOT EXISTS products_name_norm_trgm_idx
  ON products
  USING gin (name_norm gin_trgm_ops)
  WHERE is_active = true;

-- Helper function: fuzzy search product IDs by similarity
-- Returns product ids for a given tenant ordered by similarity to the search text
CREATE OR REPLACE FUNCTION public.search_products_fuzzy(
  tenant_uuid uuid,
  search_text text,
  limit_results integer DEFAULT 100
)
RETURNS TABLE (product_id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.id
  FROM products p
  WHERE p.tenant_id = tenant_uuid
    AND p.is_active = true
    AND similarity(p.name_norm, search_text) > 0.2
  ORDER BY similarity(p.name_norm, search_text) DESC, p.name_norm
  LIMIT limit_results;
$$;

