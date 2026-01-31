-- Migration 0015: Add use_margin setting to control whether to calculate margin or not
-- If use_margin is false, sell_price = cost_price + VAT only (no margin)

-- Add use_margin column to settings table
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS use_margin boolean DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN settings.use_margin IS 'אם true - מחיר מכירה כולל רווח. אם false - מחיר מכירה = עלות + מע"מ בלבד (ללא רווח)';
