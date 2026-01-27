-- Backfill profiles for existing auth users
-- This fixes foreign key errors like:
-- "insert or update on table \"categories\" violates foreign key constraint \"categories_created_by_fkey\""
-- when created_by references a user that has no row in public.profiles.

INSERT INTO public.profiles (user_id, full_name, created_at)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email, 'משתמש'),
  COALESCE(u.created_at, now())
FROM auth.users u
LEFT JOIN public.profiles p
  ON p.user_id = u.id
WHERE p.user_id IS NULL;

