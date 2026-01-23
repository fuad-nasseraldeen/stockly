-- לאפשר גם authenticated וגם service_role לקטגוריות
ALTER POLICY "Authenticated users can insert categories"
ON categories
WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

ALTER POLICY "Authenticated users can update categories"
ON categories
USING (auth.role() IN ('authenticated', 'service_role'))
WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- כנ"ל לספקים
ALTER POLICY "Authenticated users can insert suppliers"
ON suppliers
WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

ALTER POLICY "Authenticated users can update suppliers"
ON suppliers
USING (auth.role() IN ('authenticated', 'service_role'))
WITH CHECK (auth.role() IN ('authenticated', 'service_role'));