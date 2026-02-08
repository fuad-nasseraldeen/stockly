# מדריך הגדרת Supabase ל-Stockly Multi-Tenant

## שלב 1: הרצת מיגרציות

### אופציה A: דרך Supabase Dashboard (מומלץ)

1. היכנס ל-[Supabase Dashboard](https://app.supabase.com)
2. בחר את הפרויקט שלך
3. לך ל-**SQL Editor**
4. הרץ את המיגרציות בסדר הזה:

```sql
-- 1. הרץ את 0001_schema.sql
-- העתק את כל התוכן מהקובץ והרץ

-- 2. הרץ את 0002_rls_policies.sql
-- העתק את כל התוכן מהקובץ והרץ

-- 3.  אם יש לך נתונים קיימים, הרץ את 0003_migrate_existing_data.sql
```

### אופציה B: דרך Supabase CLI

```bash
# התקן Supabase CLI אם עדיין לא
npm install -g supabase

# התחבר לפרויקט
supabase link --project-ref your-project-ref

# הרץ מיגרציות
supabase db push
```

## שלב 2: בדיקת המיגרציות

לאחר הרצת המיגרציות, בדוק שהכל עבד:

```sql
-- בדוק שהטבלאות נוצרו
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('tenants', 'memberships', 'invites', 'products', 'categories', 'suppliers', 'price_entries', 'settings');

-- בדוק שה-views נוצרו
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name IN ('product_supplier_current_price', 'product_price_summary');

-- בדוק שה-functions נוצרו
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('is_member', 'get_tenant_role', 'handle_new_user');
```

## שלב 3: הגדרת Environment Variables

### ב-Backend (.env)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
FRONTEND_URL=http://localhost:5173
```

### ב-Frontend (.env)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001
```

### איפה למצוא את המפתחות?

1. היכנס ל-Supabase Dashboard
2. לך ל-**Settings** → **API**
3. העתק:
   - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **anon/public key** → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (רק ב-backend!)

⚠️ **אזהרה**: `service_role` key עוקף את כל ה-RLS policies! אל תשתף אותו ב-frontend!

## שלב 4: בדיקת RLS Policies

לאחר הרצת המיגרציות, בדוק שה-RLS מופעל:

```sql
-- בדוק שה-RLS מופעל על כל הטבלאות
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('tenants', 'memberships', 'invites', 'products', 'categories', 'suppliers', 'price_entries', 'settings');

-- כל השורות צריכות להציג rowsecurity = true
```

## שלב 5: בדיקת Functions

בדוק שה-functions עובדות:

```sql
-- בדוק את is_member (צריך להיות מחובר כמשתמש)
SELECT is_member('some-tenant-uuid');

-- בדוק את get_tenant_role (צריך להיות מחובר כמשתמש)
SELECT get_tenant_role('some-tenant-uuid');
```

## שלב 6: יצירת משתמש ראשון וטננט

לאחר שהכל מוגדר:

1. **הירשם דרך ה-frontend** - זה ייצור profile אוטומטית (בזכות ה-trigger)
2. **צור טננט ראשון** דרך ה-API:
   ```bash
   POST /api/tenants
   {
     "name": "החנות הראשון שלי"
   }
   ```
   זה ייצור:
   - טננט חדש
   - membership עם role='owner'
   - קטגוריה "כללי"
   - settings עם vat_percent=18

## שלב 7: בדיקת תקינות

### בדוק שהכל עובד:

1. **התחבר** דרך ה-frontend
2. **צור טננט** (אם אין לך)
3. **צור ספק** - בדוק שהוא נשמר עם tenant_id נכון
4. **צור מוצר** - בדוק שהוא נשמר עם tenant_id נכון
5. **בדוק RLS** - נסה לגשת לנתונים של טננט אחר (אמור להיכשל)

## בעיות נפוצות

### RLS חוסם הכל
- ודא שהמשתמש מחובר
- ודא שיש membership לטננט
- בדוק שה-`is_member` function עובדת

### Views לא עובדות
- ודא שה-views נוצרו (בדוק ב-SQL Editor)
- ודא שה-views כוללות `tenant_id`

### Service Role לא עובד
- ודא שהשתמשת ב-`SUPABASE_SERVICE_ROLE_KEY` (לא anon key)
- ודא שה-key נכון (העתק מ-Settings → API)

## הערות חשובות

1. **RLS Policies**: כל ה-policies משתמשות ב-`is_member(tenant_id)` - זה אומר שרק חברי טננט יכולים לראות/לערוך נתונים
2. **Service Role**: ה-backend משתמש ב-service role כדי לעקוף RLS - זה תקין כי ה-backend בודק membership בעצמו
3. **Views**: ה-views `product_supplier_current_price` ו-`product_price_summary` כוללות `tenant_id` - חשוב לסנן לפי זה

## סיכום

✅ הרץ את המיגרציות (0001, 0002, אולי 0003)
✅ הגדר environment variables
✅ בדוק שה-RLS מופעל
✅ צור משתמש ראשון וטננט
✅ בדוק שהכל עובד

זה הכל! המערכת אמורה לעבוד.
