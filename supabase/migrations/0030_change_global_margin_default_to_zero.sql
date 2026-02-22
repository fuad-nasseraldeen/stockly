-- Migration 0030: Change global margin default to 0
-- New tenants/settings rows should start with 0% global margin by default.

ALTER TABLE settings
ALTER COLUMN global_margin_percent SET DEFAULT 0.00;
