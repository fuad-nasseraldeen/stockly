-- Migration 0031: Change decimal precision default to 4
-- New settings rows should default to 4 decimal places.

ALTER TABLE settings
ALTER COLUMN decimal_precision SET DEFAULT 4;
