-- Migration 0027: add "roll" package type (safe, non-breaking)
DO $$
BEGIN
  ALTER TYPE package_type_enum ADD VALUE IF NOT EXISTS 'roll';
EXCEPTION
  WHEN undefined_object THEN
    -- If enum doesn't exist yet (out-of-order environments), create full enum safely.
    CREATE TYPE package_type_enum AS ENUM (
      'carton',
      'gallon',
      'bag',
      'bottle',
      'pack',
      'shrink',
      'sachet',
      'can',
      'roll',
      'unknown'
    );
END
$$;
