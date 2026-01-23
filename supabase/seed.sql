-- Seed script for initial data
-- Run this AFTER creating the first user manually

-- Example: Create a category
-- INSERT INTO categories (name, default_margin_percent, created_by)
-- VALUES ('מוצרי מזון', 20.00, '<USER_ID_HERE>');

-- Example: Create a supplier
-- INSERT INTO suppliers (name, phone, created_by)
-- VALUES ('ספק ראשי', '050-1234567', '<USER_ID_HERE>');

-- To create the first owner:
-- 1. Sign up a user via the app (this creates auth.users entry)
-- 2. Get the user_id from auth.users
-- 3. Run:
--    INSERT INTO profiles (user_id, full_name, role)
--    VALUES ('<USER_ID_HERE>', 'בעלים ראשי', 'owner');
