-- Migration 0016: Add use_vat setting to control whether to calculate VAT or not
-- If use_vat is false, sell_price = cost_price (or cost_price + margin if use_margin is true)

-- Add use_vat column to settings table
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS use_vat boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN settings.use_vat IS 'אם true - מחיר מכירה כולל מע"מ. אם false - מחיר מכירה ללא מע"מ (עלות + רווח בלבד)';
