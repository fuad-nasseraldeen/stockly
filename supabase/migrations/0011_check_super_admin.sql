-- Migration 0011: Check and fix super admin status
-- Run this to verify and fix super admin setup

-- Check current super admin status
SELECT 
  u.email,
  p.is_super_admin,
  p.user_id
FROM auth.users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.email = 'fuad@owner.com';

-- If the user exists but is_super_admin is false, fix it:
UPDATE profiles 
SET is_super_admin = true 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'fuad@owner.com'
);

-- Verify after update
SELECT 
  u.email,
  p.is_super_admin,
  p.user_id
FROM auth.users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.email = 'fuad@owner.com';
