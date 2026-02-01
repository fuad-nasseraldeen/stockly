-- Migration 0019: Change default values for use_margin and use_vat to false
-- Default behavior: don't calculate margin or VAT unless explicitly enabled

-- Change default value for use_margin column
ALTER TABLE settings
ALTER COLUMN use_margin SET DEFAULT false;

-- Change default value for use_vat column
ALTER TABLE settings
ALTER COLUMN use_vat SET DEFAULT false;

-- Update existing settings that are NULL to false (if any)
UPDATE settings
SET use_margin = false
WHERE use_margin IS NULL;

UPDATE settings
SET use_vat = false
WHERE use_vat IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN settings.use_margin IS 'אם true - מחיר מכירה כולל רווח. אם false - מחיר מכירה = עלות בלבד (ללא רווח וללא מע"מ, אלא אם use_vat=true)';
COMMENT ON COLUMN settings.use_vat IS 'אם true - מחיר מכירה כולל מע"מ. אם false - מחיר מכירה ללא מע"מ (עלות + רווח אם use_margin=true, או עלות בלבד)';
