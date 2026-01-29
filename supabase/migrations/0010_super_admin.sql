-- Migration 0010: Super Admin System
-- Add super admin capability for application owner (fuad@owner.com)

-- Add is_super_admin field to profiles
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false NOT NULL;

-- Create index for super admin queries
CREATE INDEX IF NOT EXISTS profiles_super_admin_idx
  ON profiles (is_super_admin) 
  WHERE is_super_admin = true;

-- Grant super admin access to fuad@owner.com automatically
-- This will set is_super_admin = true for the user with email fuad@owner.com
UPDATE profiles 
SET is_super_admin = true 
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'fuad@owner.com'
);

-- Function to automatically grant super admin when user with fuad@owner.com signs up
-- This function will be called when a profile is created
CREATE OR REPLACE FUNCTION auto_grant_super_admin()
RETURNS trigger AS $$
DECLARE
  user_email text;
BEGIN
  -- Get the email of the user
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.user_id;
  
  -- If email is fuad@owner.com, grant super admin
  IF user_email = 'fuad@owner.com' THEN
    NEW.is_super_admin := true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-grant super admin on profile creation
DROP TRIGGER IF EXISTS auto_grant_super_admin_trigger ON profiles;
CREATE TRIGGER auto_grant_super_admin_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_super_admin();

-- Also update existing profiles if they match
UPDATE profiles 
SET is_super_admin = true 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'fuad@owner.com'
);
