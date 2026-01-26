-- Stockly - RLS Policies for Multi-Tenant
-- Migration 0002: Member-based Row Level Security policies
-- All policies check membership via is_member(tenant_id)
-- Owner-only operations use get_tenant_role(tenant_id) = 'owner'

-- ============================================
-- DROP EXISTING POLICIES (by name, not loop)
-- ============================================

-- Tenants policies
DROP POLICY IF EXISTS "Members can read their tenants" ON tenants;
DROP POLICY IF EXISTS "Owners can create tenants" ON tenants;
DROP POLICY IF EXISTS "Owners can update their tenants" ON tenants;

-- Memberships policies
DROP POLICY IF EXISTS "Users can read their memberships" ON memberships;
DROP POLICY IF EXISTS "Owners can manage memberships" ON memberships;

-- Invites policies
DROP POLICY IF EXISTS "Users can read invites for their email" ON invites;
DROP POLICY IF EXISTS "Owners can manage invites" ON invites;

-- Profiles policies
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Categories policies
DROP POLICY IF EXISTS "Members can read active categories" ON categories;
DROP POLICY IF EXISTS "Members can insert categories" ON categories;
DROP POLICY IF EXISTS "Members can update categories" ON categories;
DROP POLICY IF EXISTS "Members can delete categories" ON categories;

-- Suppliers policies
DROP POLICY IF EXISTS "Members can read active suppliers" ON suppliers;
DROP POLICY IF EXISTS "Members can insert suppliers" ON suppliers;
DROP POLICY IF EXISTS "Members can update suppliers" ON suppliers;
DROP POLICY IF EXISTS "Members can delete suppliers" ON suppliers;

-- Products policies
DROP POLICY IF EXISTS "Members can read active products" ON products;
DROP POLICY IF EXISTS "Members can insert products" ON products;
DROP POLICY IF EXISTS "Members can update products" ON products;
DROP POLICY IF EXISTS "Members can delete products" ON products;

-- Price entries policies
DROP POLICY IF EXISTS "Members can read price entries" ON price_entries;
DROP POLICY IF EXISTS "Members can insert price entries" ON price_entries;
DROP POLICY IF EXISTS "Members can update price entries" ON price_entries;
DROP POLICY IF EXISTS "Members can delete price entries" ON price_entries;

-- Settings policies
DROP POLICY IF EXISTS "Members can read settings" ON settings;
DROP POLICY IF EXISTS "Members can insert settings" ON settings;
DROP POLICY IF EXISTS "Members can update settings" ON settings;
DROP POLICY IF EXISTS "Members can delete settings" ON settings;

-- ============================================
-- TENANTS POLICIES
-- ============================================

-- Members can read tenants they belong to
CREATE POLICY "Members can read their tenants"
  ON tenants FOR SELECT
  USING (is_member(id));

-- Owners can create tenants (will create membership separately)
CREATE POLICY "Owners can create tenants"
  ON tenants FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Owners can update their tenants
CREATE POLICY "Owners can update their tenants"
  ON tenants FOR UPDATE
  USING (is_member(id) AND get_tenant_role(id) = 'owner')
  WITH CHECK (is_member(id) AND get_tenant_role(id) = 'owner');

-- ============================================
-- MEMBERSHIPS POLICIES
-- ============================================

-- Users can read their own memberships
CREATE POLICY "Users can read their memberships"
  ON memberships FOR SELECT
  USING (auth.uid() = user_id OR is_member(tenant_id));

-- Owners can manage memberships in their tenants
CREATE POLICY "Owners can manage memberships"
  ON memberships FOR ALL
  USING (
    is_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner'
  )
  WITH CHECK (
    is_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner'
  );

-- ============================================
-- INVITES POLICIES
-- ============================================

-- Users can read invites for their email (to accept)
CREATE POLICY "Users can read invites for their email"
  ON invites FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR is_member(tenant_id)
  );

-- Owners can manage invites in their tenants
CREATE POLICY "Owners can manage invites"
  ON invites FOR ALL
  USING (
    is_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner'
  )
  WITH CHECK (
    is_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner'
  );

-- ============================================
-- PROFILES POLICIES
-- ============================================

-- Users can read all profiles (for display names)
CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can insert own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- CATEGORIES POLICIES
-- ============================================

-- Members can read active categories in their tenants
CREATE POLICY "Members can read active categories"
  ON categories FOR SELECT
  USING (is_member(tenant_id) AND is_active = true);

-- Members can insert categories in their tenants
CREATE POLICY "Members can insert categories"
  ON categories FOR INSERT
  WITH CHECK (is_member(tenant_id));

-- Members can update categories in their tenants
CREATE POLICY "Members can update categories"
  ON categories FOR UPDATE
  USING (is_member(tenant_id))
  WITH CHECK (is_member(tenant_id));

-- Members can delete categories in their tenants
CREATE POLICY "Members can delete categories"
  ON categories FOR DELETE
  USING (is_member(tenant_id));

-- ============================================
-- SUPPLIERS POLICIES
-- ============================================

-- Members can read active suppliers in their tenants
CREATE POLICY "Members can read active suppliers"
  ON suppliers FOR SELECT
  USING (is_member(tenant_id) AND is_active = true);

-- Members can insert suppliers in their tenants
CREATE POLICY "Members can insert suppliers"
  ON suppliers FOR INSERT
  WITH CHECK (is_member(tenant_id));

-- Members can update suppliers in their tenants
CREATE POLICY "Members can update suppliers"
  ON suppliers FOR UPDATE
  USING (is_member(tenant_id))
  WITH CHECK (is_member(tenant_id));

-- Members can delete suppliers in their tenants
CREATE POLICY "Members can delete suppliers"
  ON suppliers FOR DELETE
  USING (is_member(tenant_id));

-- ============================================
-- PRODUCTS POLICIES
-- ============================================

-- Members can read active products in their tenants
CREATE POLICY "Members can read active products"
  ON products FOR SELECT
  USING (is_member(tenant_id) AND is_active = true);

-- Members can insert products in their tenants
CREATE POLICY "Members can insert products"
  ON products FOR INSERT
  WITH CHECK (is_member(tenant_id));

-- Members can update products in their tenants
CREATE POLICY "Members can update products"
  ON products FOR UPDATE
  USING (is_member(tenant_id))
  WITH CHECK (is_member(tenant_id));

-- Members can delete products in their tenants
CREATE POLICY "Members can delete products"
  ON products FOR DELETE
  USING (is_member(tenant_id));

-- ============================================
-- PRICE ENTRIES POLICIES
-- ============================================

-- Members can read price entries in their tenants
CREATE POLICY "Members can read price entries"
  ON price_entries FOR SELECT
  USING (is_member(tenant_id));

-- Members can insert price entries in their tenants
CREATE POLICY "Members can insert price entries"
  ON price_entries FOR INSERT
  WITH CHECK (is_member(tenant_id));

-- Members can update price entries in their tenants
CREATE POLICY "Members can update price entries"
  ON price_entries FOR UPDATE
  USING (is_member(tenant_id))
  WITH CHECK (is_member(tenant_id));

-- Members can delete price entries in their tenants
CREATE POLICY "Members can delete price entries"
  ON price_entries FOR DELETE
  USING (is_member(tenant_id));

-- ============================================
-- SETTINGS POLICIES
-- ============================================

-- Members can read settings in their tenants
CREATE POLICY "Members can read settings"
  ON settings FOR SELECT
  USING (is_member(tenant_id));

-- Members can insert settings in their tenants
CREATE POLICY "Members can insert settings"
  ON settings FOR INSERT
  WITH CHECK (is_member(tenant_id));

-- Members can update settings in their tenants
CREATE POLICY "Members can update settings"
  ON settings FOR UPDATE
  USING (is_member(tenant_id))
  WITH CHECK (is_member(tenant_id));

-- Members can delete settings in their tenants
CREATE POLICY "Members can delete settings"
  ON settings FOR DELETE
  USING (is_member(tenant_id));
