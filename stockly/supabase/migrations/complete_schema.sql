-- Stockly - Complete Database Schema
-- Single migration file with all requirements
-- 
-- IMPORTANT: If you're using an existing Supabase project, run this migration
-- to update the schema. It will:
-- 1. Remove quantity/min_quantity columns if they exist
-- 2. Update RLS policies to allow all authenticated users
-- 3. Ensure auto-create profile trigger exists
-- 4. Create default category if missing

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'worker')) DEFAULT 'owner',
  created_at timestamptz DEFAULT now()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_margin_percent numeric(5,2) DEFAULT 0 CHECK (default_margin_percent >= 0 AND default_margin_percent <= 500),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Unique constraint: active category names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_active_name ON categories (LOWER(name)) WHERE is_active = true;

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Unique constraint: active supplier names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_unique_active_name ON suppliers (LOWER(name)) WHERE is_active = true;

-- Products table - Remove quantity/min_quantity if they exist
DO $$ 
BEGIN
  -- Drop quantity columns if they exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'quantity') THEN
    ALTER TABLE products DROP COLUMN quantity;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'min_quantity') THEN
    ALTER TABLE products DROP COLUMN min_quantity;
  END IF;
END $$;

-- Products table (create if not exists, but don't recreate if it exists)
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_norm text NOT NULL,
  category_id uuid REFERENCES categories(id),
  unit text NOT NULL CHECK (unit IN ('unit', 'kg', 'liter')) DEFAULT 'unit',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Unique constraint: active products in same category (normalized name)
CREATE UNIQUE INDEX IF NOT EXISTS products_unique_active_category_name ON products (category_id, name_norm) WHERE is_active = true;

-- Price entries table
CREATE TABLE IF NOT EXISTS price_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  cost_price numeric(10,2) NOT NULL CHECK (cost_price >= 0),
  margin_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (margin_percent >= 0 AND margin_percent <= 500),
  sell_price numeric(10,2) NOT NULL CHECK (sell_price >= 0),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(user_id)
);

-- Indexes for price entries
CREATE INDEX IF NOT EXISTS price_entries_product_created_idx ON price_entries (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS price_entries_product_supplier_created_idx ON price_entries (product_id, supplier_id, created_at DESC);

-- ============================================
-- VIEWS
-- ============================================

-- View: current price per product (latest entry)
CREATE OR REPLACE VIEW product_current_price AS
SELECT DISTINCT ON (product_id)
  product_id,
  supplier_id,
  cost_price,
  margin_percent,
  sell_price,
  created_at
FROM price_entries
ORDER BY product_id, created_at DESC;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_entries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - Drop old policies and create new ones
-- ============================================

-- Drop all existing policies (if any)
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- Profiles policies
CREATE POLICY "Authenticated users can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Categories policies
CREATE POLICY "Authenticated users can read active categories"
  ON categories FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

CREATE POLICY "Authenticated users can insert categories"
  ON categories FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update categories"
  ON categories FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete categories"
  ON categories FOR DELETE
  USING (auth.role() = 'authenticated');

-- Suppliers policies
CREATE POLICY "Authenticated users can read active suppliers"
  ON suppliers FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

CREATE POLICY "Authenticated users can insert suppliers"
  ON suppliers FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update suppliers"
  ON suppliers FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete suppliers"
  ON suppliers FOR DELETE
  USING (auth.role() = 'authenticated');

-- Products policies
CREATE POLICY "Authenticated users can read active products"
  ON products FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE
  USING (auth.role() = 'authenticated');

-- Price entries policies
CREATE POLICY "Authenticated users can read price entries"
  ON price_entries FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert price entries"
  ON price_entries FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update price entries"
  ON price_entries FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete price entries"
  ON price_entries FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-create profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'משתמש'),
    'owner'
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
-- DEFAULT DATA
-- ============================================

-- Create default "כללי" category if it doesn't exist
INSERT INTO categories (name, default_margin_percent, is_active)
SELECT 'כללי', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE name = 'כללי' AND is_active = true
);
