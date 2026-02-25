ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS phone_e164 text;

ALTER TABLE invites
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE invites
  DROP CONSTRAINT IF EXISTS invites_tenant_id_email_accepted_at_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invites_target_required_chk'
  ) THEN
    ALTER TABLE invites
      ADD CONSTRAINT invites_target_required_chk
      CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invites_phone_idx
  ON invites (phone_e164)
  WHERE accepted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invites_pending_email_unique_idx
  ON invites (tenant_id, lower(email))
  WHERE accepted_at IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invites_pending_phone_unique_idx
  ON invites (tenant_id, phone_e164)
  WHERE accepted_at IS NULL AND phone_e164 IS NOT NULL;
