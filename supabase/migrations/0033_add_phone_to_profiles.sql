ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_unique_idx
  ON profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL;
