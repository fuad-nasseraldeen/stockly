-- Migration 0007: Add search performance indexes
-- Add indexes for faster search queries on normalized name fields

-- Index for product search by normalized name (tenant-scoped)
CREATE INDEX IF NOT EXISTS products_name_norm_search_idx 
  ON products (tenant_id, name_norm) 
  WHERE is_active = true;

-- Index for supplier search (case-insensitive)
CREATE INDEX IF NOT EXISTS suppliers_name_lower_idx 
  ON suppliers (tenant_id, LOWER(name)) 
  WHERE is_active = true;

-- Index for category search (case-insensitive)
CREATE INDEX IF NOT EXISTS categories_name_lower_idx 
  ON categories (tenant_id, LOWER(name)) 
  WHERE is_active = true;
