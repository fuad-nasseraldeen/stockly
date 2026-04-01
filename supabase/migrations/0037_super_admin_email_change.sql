-- Switch application super admin from fuad@owner.com to fuadnasiraldin@gmail.com

UPDATE profiles
SET is_super_admin = false
WHERE user_id IN (
  SELECT id FROM auth.users WHERE lower(trim(email::text)) = 'fuad@owner.com'
);

UPDATE profiles
SET is_super_admin = true
WHERE user_id IN (
  SELECT id FROM auth.users WHERE lower(trim(email::text)) = 'fuadnasiraldin@gmail.com'
);

CREATE OR REPLACE FUNCTION auto_grant_super_admin()
RETURNS trigger AS $$
DECLARE
  user_email text;
BEGIN
  SELECT lower(trim(email::text)) INTO user_email
  FROM auth.users
  WHERE id = NEW.user_id;

  IF user_email = 'fuadnasiraldin@gmail.com' THEN
    NEW.is_super_admin := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
