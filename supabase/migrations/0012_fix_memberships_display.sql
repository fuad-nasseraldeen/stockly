-- Migration 0012: Fix memberships display in admin panel
-- This migration checks and fixes issues with memberships not showing in admin

-- Step 1: Check what we have
-- Run this to see all memberships with tenant and user info:
SELECT 
  m.id as membership_id,
  m.user_id,
  m.tenant_id,
  m.role,
  m.created_at as membership_created,
  t.name as tenant_name,
  p.full_name as user_name,
  u.email as user_email
FROM memberships m
LEFT JOIN tenants t ON t.id = m.tenant_id
LEFT JOIN profiles p ON p.user_id = m.user_id
LEFT JOIN auth.users u ON u.id = m.user_id
ORDER BY m.created_at DESC;

-- Step 2: Check tenants without memberships
SELECT 
  t.id,
  t.name,
  t.created_at,
  COUNT(m.id) as membership_count
FROM tenants t
LEFT JOIN memberships m ON m.tenant_id = t.id
GROUP BY t.id, t.name, t.created_at
HAVING COUNT(m.id) = 0
ORDER BY t.created_at DESC;

-- Step 3: If you have tenants without memberships but you know who should be the owner,
-- you can manually create memberships. For example, if you want to make a specific user
-- the owner of all tenants that don't have owners:

-- IMPORTANT: Replace 'your-email@example.com' with the actual email of the user who should be owner
-- This will create memberships for all tenants that don't have any memberships
INSERT INTO memberships (user_id, tenant_id, role)
SELECT 
  u.id as user_id,
  t.id as tenant_id,
  'owner' as role
FROM tenants t
CROSS JOIN auth.users u
WHERE u.email = 'your-email@example.com'  -- ⚠️ REPLACE WITH ACTUAL EMAIL
  AND NOT EXISTS (
    SELECT 1 FROM memberships m 
    WHERE m.tenant_id = t.id
  )
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- Step 4: Verify the fix
-- After running the INSERT above, run this to verify:
SELECT 
  t.name as tenant_name,
  COUNT(m.id) as total_members,
  COUNT(CASE WHEN m.role = 'owner' THEN 1 END) as owners,
  COUNT(CASE WHEN m.role = 'worker' THEN 1 END) as workers
FROM tenants t
LEFT JOIN memberships m ON m.tenant_id = t.id
GROUP BY t.id, t.name
ORDER BY t.created_at DESC;
