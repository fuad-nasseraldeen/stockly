-- Migration 0026: Safe package metadata extension for import flows
-- Goal: add packaging metadata fields without changing existing pricing logic.

DO $$
BEGIN
  CREATE TYPE package_type_enum AS ENUM (
    'carton',
    'gallon',
    'bag',
    'bottle',
    'pack',
    'shrink',
    'sachet',
    'can',
    'unknown'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE price_entries
ADD COLUMN IF NOT EXISTS package_type package_type_enum DEFAULT 'unknown';

ALTER TABLE price_entries
ADD COLUMN IF NOT EXISTS source_price_includes_vat boolean DEFAULT false;

ALTER TABLE price_entries
ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2);

ALTER TABLE price_entries
ADD COLUMN IF NOT EXISTS effective_from timestamp;
