-- Store per-tenant import column mappings for re-use in import wizard
CREATE TABLE IF NOT EXISTS import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mapping_json JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_import_mappings_tenant_updated
  ON import_mappings(tenant_id, updated_at DESC);

ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read import mappings" ON import_mappings;
DROP POLICY IF EXISTS "Members can insert import mappings" ON import_mappings;
DROP POLICY IF EXISTS "Members can update import mappings" ON import_mappings;
DROP POLICY IF EXISTS "Members can delete import mappings" ON import_mappings;

CREATE POLICY "Members can read import mappings"
  ON import_mappings
  FOR SELECT
  USING (is_member(tenant_id));

CREATE POLICY "Members can insert import mappings"
  ON import_mappings
  FOR INSERT
  WITH CHECK (is_member(tenant_id));

CREATE POLICY "Members can update import mappings"
  ON import_mappings
  FOR UPDATE
  USING (is_member(tenant_id))
  WITH CHECK (is_member(tenant_id));

CREATE POLICY "Members can delete import mappings"
  ON import_mappings
  FOR DELETE
  USING (is_member(tenant_id));

COMMENT ON TABLE import_mappings IS 'Saved column mapping presets for import wizard per tenant';
COMMENT ON COLUMN import_mappings.mapping_json IS 'Serialized mapping payload (field -> source column index)';
