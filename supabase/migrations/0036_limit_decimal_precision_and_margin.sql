-- Limit decimal_precision to 0-5 and global_margin_percent to 0-100.
-- Drop old constraints and add new ones.

-- Clamp existing data before adding new constraints
UPDATE settings SET decimal_precision = 5 WHERE decimal_precision > 5;
UPDATE settings SET global_margin_percent = 100 WHERE global_margin_percent > 100;

ALTER TABLE settings
  DROP CONSTRAINT IF EXISTS settings_decimal_precision_check;

ALTER TABLE settings
  ADD CONSTRAINT settings_decimal_precision_check
  CHECK (decimal_precision BETWEEN 0 AND 5);

-- Drop old global_margin constraint (from 0005: 0-500) and add new (0-100)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.settings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%500%'
  LOOP
    EXECUTE format('ALTER TABLE settings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE settings
  ADD CONSTRAINT settings_global_margin_percent_check
  CHECK (global_margin_percent >= 0 AND global_margin_percent <= 100);
