-- Extend import_mappings for multi-source templates (excel/pdf)
-- Requires: 0024_add_import_mappings.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'import_source_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.import_source_type AS ENUM ('excel', 'pdf');
  END IF;
END$$;

ALTER TABLE IF EXISTS public.import_mappings
  ADD COLUMN IF NOT EXISTS source_type public.import_source_type NOT NULL DEFAULT 'excel',
  ADD COLUMN IF NOT EXISTS template_key text;

DO $$
BEGIN
  IF to_regclass('public.import_mappings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_import_mappings_tenant_source_template
      ON public.import_mappings (tenant_id, source_type, template_key);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_import_mappings_tenant_source_template_name
      ON public.import_mappings (tenant_id, source_type, COALESCE(template_key, ''), name);
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('public.import_mappings') IS NOT NULL THEN
    COMMENT ON COLUMN import_mappings.source_type IS 'Import source type: excel or pdf';
    COMMENT ON COLUMN import_mappings.template_key IS 'Optional template fingerprint/key for reusable vendor PDF mappings';
  END IF;
END$$;

