-- Add first/last name support while keeping backward compatibility with full_name.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Backfill from existing full_name where possible.
UPDATE public.profiles
SET
  first_name = NULLIF(split_part(trim(full_name), ' ', 1), ''),
  last_name = NULLIF(trim(regexp_replace(trim(full_name), '^[^ ]+\s*', '')), '')
WHERE (first_name IS NULL OR last_name IS NULL)
  AND full_name IS NOT NULL
  AND length(trim(full_name)) > 0;
