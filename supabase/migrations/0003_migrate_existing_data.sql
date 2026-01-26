-- Stockly - Migration from Single-Tenant to Multi-Tenant
-- Migration 0003: Migrate existing data (if any) to multi-tenant structure
-- This migration is safe to run on empty databases (it will do nothing)
-- Run this ONLY if you have existing data from the old schema

-- ============================================
-- IMPORTANT: This migration assumes you want to migrate existing data
-- to a default tenant. Adjust tenant_id as needed.
-- ============================================

-- Step 1: Create a default tenant if none exists and we have old data
DO $$
DECLARE
  default_tenant_id uuid;
  has_old_data boolean := false;
BEGIN
  -- Check if we have old data (tables without tenant_id)
  -- Note: This assumes old schema had tables without tenant_id column
  -- If your old schema already had tenant_id, this migration is not needed
  
  -- Check if categories table exists and has rows without tenant_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'categories' 
    AND column_name = 'tenant_id'
  ) THEN
    -- Schema already has tenant_id, skip migration
    RETURN;
  END IF;

  -- Create default tenant for migration
  INSERT INTO tenants (name, created_at, updated_at)
  VALUES ('טננט ראשי', now(), now())
  ON CONFLICT DO NOTHING
  RETURNING id INTO default_tenant_id;

  -- If no default tenant was created, get existing one
  IF default_tenant_id IS NULL THEN
    SELECT id INTO default_tenant_id FROM tenants LIMIT 1;
  END IF;

  -- If we still don't have a tenant, something is wrong
  IF default_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant found. Please create a tenant first.';
  END IF;

  -- Step 2: Add tenant_id to existing tables (if columns don't exist)
  -- This is a safety check - if columns already exist, ALTER will fail gracefully
  -- We'll catch and ignore those errors

  BEGIN
    -- Add tenant_id to categories if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'categories' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE categories ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
      UPDATE categories SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
      ALTER TABLE categories ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Column already exists or other error, continue
    NULL;
  END;

  BEGIN
    -- Add tenant_id to suppliers if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'suppliers' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE suppliers ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
      UPDATE suppliers SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
      ALTER TABLE suppliers ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    -- Add tenant_id to products if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE products ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
      UPDATE products SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
      ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    -- Add tenant_id to price_entries if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'price_entries' AND column_name = 'tenant_id'
    ) THEN
      ALTER TABLE price_entries ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
      UPDATE price_entries SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
      ALTER TABLE price_entries ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    -- Update settings table structure if needed
    -- Old schema might have had settings with id instead of tenant_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'settings' AND column_name = 'id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'settings' AND column_name = 'tenant_id'
    ) THEN
      -- Migrate settings: create new table structure
      ALTER TABLE settings ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
      UPDATE settings SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
      ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
      ALTER TABLE settings DROP COLUMN IF EXISTS id;
      ALTER TABLE settings ADD PRIMARY KEY (tenant_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Step 3: Recreate indexes with tenant_id
  -- Drop old unique indexes
  DROP INDEX IF EXISTS categories_unique_active_name;
  DROP INDEX IF EXISTS suppliers_unique_active_name;
  DROP INDEX IF EXISTS products_unique_active_category_name;

  -- Create new tenant-aware unique indexes
  CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_active_name 
    ON categories (tenant_id, LOWER(name)) WHERE is_active = true;
  
  CREATE UNIQUE INDEX IF NOT EXISTS suppliers_unique_active_name 
    ON suppliers (tenant_id, LOWER(name)) WHERE is_active = true;
  
  CREATE UNIQUE INDEX IF NOT EXISTS products_unique_active_category_name 
    ON products (tenant_id, category_id, name_norm) WHERE is_active = true;

  -- Recreate price entry indexes with tenant_id
  DROP INDEX IF EXISTS price_entries_product_created_idx;
  DROP INDEX IF EXISTS price_entries_product_supplier_created_idx;

  CREATE INDEX IF NOT EXISTS price_entries_tenant_product_created_idx 
    ON price_entries (tenant_id, product_id, created_at DESC);
  
  CREATE INDEX IF NOT EXISTS price_entries_tenant_product_supplier_created_idx 
    ON price_entries (tenant_id, product_id, supplier_id, created_at DESC);

END $$;

-- Note: After running this migration, you should:
-- 1. Create memberships for existing users to the default tenant
-- 2. Run migration 0002_rls_policies.sql to set up RLS
-- 3. Test that all data is accessible with proper tenant context
