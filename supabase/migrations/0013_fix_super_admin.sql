-- Migration 0013: Fix super admin status for fuad@owner.com
-- Run this in Supabase SQL Editor to verify and fix super admin status

-- Step 1: Check if user exists in auth.users
SELECT 
  id,
  email,
  created_at
FROM auth.users 
WHERE email = 'fuad@owner.com';

-- Step 2: Check current profile status
SELECT 
  p.user_id,
  p.full_name,
  p.is_super_admin,
  u.email
FROM profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE u.email = 'fuad@owner.com';

-- Step 3: Update profile to grant super admin (if user exists)
UPDATE profiles 
SET is_super_admin = true 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'fuad@owner.com'
);

-- Step 4: Verify the update worked
SELECT 
  p.user_id,
  p.full_name,
  p.is_super_admin,
  u.email
FROM profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE u.email = 'fuad@owner.com';

-- Expected result: is_super_admin should be true
