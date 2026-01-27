-- Migration 0005: Add global margin percent to settings

ALTER TABLE settings
ADD COLUMN IF NOT EXISTS global_margin_percent numeric(5,2) NOT NULL DEFAULT 30.00
  CHECK (global_margin_percent >= 0 AND global_margin_percent <= 500);

-- Ensure all existing rows have a value
UPDATE settings
SET global_margin_percent = 30.00
WHERE global_margin_percent IS NULL;

