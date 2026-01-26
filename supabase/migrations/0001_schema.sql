-- Stockly - Multi-Tenant Schema
-- Migration 0001: Complete multi-tenant schema with tenants, memberships, invites
-- All business tables include tenant_id for data isolation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CLEANUP: Drop old tables/views if they exist (without tenant_id)
-- ============================================

-- Drop old views first (they might depend on old tables)
DROP VIEW IF EXISTS product_current_price CASCADE;
DROP VIEW IF EXISTS product_supplier_current_price CASCADE;
DROP VIEW IF EXISTS product_price_summary CASCADE;

-- Drop old tables if they exist (only if they don't have tenant_id)
-- This is safe because we'll recreate them with tenant_id
DO $$
BEGIN
  -- Check and drop old categories table if it exists without tenant_id
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'categories'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'categories' AND column_name = 'tenant_id'
  ) THEN
    DROP TABLE IF EXISTS categories CASCADE;
  END IF;

  -- Check and drop old suppliers table if it exists without tenant_id
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'suppliers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' AND column_name = 'tenant_id'
  ) THEN
    DROP TABLE IF EXISTS suppliers CASCADE;
  END IF;

  -- Check and drop old products table if it exists without tenant_id
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'products'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'tenant_id'
  ) THEN
    DROP TABLE IF EXISTS products CASCADE;
  END IF;

  -- Check and drop old price_entries table if it exists without tenant_id
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'price_entries'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'price_entries' AND column_name = 'tenant_id'
  ) THEN
    DROP TABLE IF EXISTS price_entries CASCADE;
  END IF;

  -- Check and drop old settings table if it has id instead of tenant_id
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'settings'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settings' AND column_name = 'id'
  ) THEN
    DROP TABLE IF EXISTS settings CASCADE;
  END IF;
END $$;

-- ============================================
-- MULTI-TENANT TABLES
-- ============================================

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Memberships: users belong to tenants with a role
CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'worker')) DEFAULT 'worker',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_tenant_idx ON memberships(tenant_id);

-- Invites: pending invitations to join tenants
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'worker')) DEFAULT 'worker',
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, email, accepted_at) -- Allow re-invite if previous was declined/expired
);

CREATE INDEX IF NOT EXISTS invites_token_idx ON invites(token) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS invites_email_idx ON invites(email) WHERE accepted_at IS NULL;

-- ============================================
-- PROFILES (simplified, no tenant-specific role)
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- BUSINESS TABLES (all include tenant_id)
-- ============================================

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_margin_percent numeric(5,2) DEFAULT 0 CHECK (default_margin_percent >= 0 AND default_margin_percent <= 500),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Unique constraint: active category names per tenant (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_active_name ON categories (tenant_id, LOWER(name)) WHERE is_active = true;

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Unique constraint: active supplier names per tenant (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_unique_active_name ON suppliers (tenant_id, LOWER(name)) WHERE is_active = true;

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_norm text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  unit text NOT NULL CHECK (unit IN ('unit', 'kg', 'liter')) DEFAULT 'unit',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Unique constraint: active products per tenant in same category (normalized name)
CREATE UNIQUE INDEX IF NOT EXISTS products_unique_active_category_name ON products (tenant_id, category_id, name_norm) WHERE is_active = true;

-- Price entries table
CREATE TABLE IF NOT EXISTS price_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  cost_price numeric(10,2) NOT NULL CHECK (cost_price >= 0),
  margin_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (margin_percent >= 0 AND margin_percent <= 500),
  sell_price numeric(10,2) NOT NULL CHECK (sell_price >= 0),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Indexes for price entries
CREATE INDEX IF NOT EXISTS price_entries_tenant_product_created_idx ON price_entries (tenant_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS price_entries_tenant_product_supplier_created_idx ON price_entries (tenant_id, product_id, supplier_id, created_at DESC);

-- Settings table (per tenant)
CREATE TABLE IF NOT EXISTS settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  vat_percent numeric(5,2) NOT NULL DEFAULT 18.00 CHECK (vat_percent >= 0 AND vat_percent <= 100),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- VIEWS (tenant-safe)
-- ============================================

-- Current price per (product, supplier) per tenant: latest price_entries row
CREATE OR REPLACE VIEW product_supplier_current_price AS
SELECT DISTINCT ON (pe.tenant_id, pe.product_id, pe.supplier_id)
  pe.tenant_id,
  pe.product_id,
  pe.supplier_id,
  pe.cost_price,
  pe.margin_percent,
  pe.sell_price,
  pe.created_at
FROM price_entries pe
ORDER BY pe.tenant_id, pe.product_id, pe.supplier_id, pe.created_at DESC;

-- Summary per product per tenant for sorting/filtering
CREATE OR REPLACE VIEW product_price_summary AS
SELECT
  c.tenant_id,
  c.product_id,
  MIN(c.cost_price) AS min_current_cost_price,
  MIN(c.sell_price) AS min_current_sell_price,
  MAX(c.created_at) AS last_price_update_at
FROM product_supplier_current_price c
GROUP BY c.tenant_id, c.product_id;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check if current user is a member of a tenant
CREATE OR REPLACE FUNCTION is_member(tenant_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
      AND tenant_id = tenant_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role in a tenant
CREATE OR REPLACE FUNCTION get_tenant_role(tenant_uuid uuid)
RETURNS text AS $$
BEGIN
  RETURN (
    SELECT role FROM memberships
    WHERE user_id = auth.uid()
      AND tenant_id = tenant_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'משתמש')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
