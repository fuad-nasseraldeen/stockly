# 🗄️ Supabase Database - מדריך מיגרציות

מדריך מפורט למיגרציות מסד הנתונים של Stockly.

---

## 📁 רשימת מיגרציות (21 מיגרציות)

המיגרציות צריכות לרוץ **בסדר המספרים** (0001, 0002, 0003...):

### מיגרציות בסיסיות (1-6)
- **0001_schema.sql** - סכמה בסיסית (טבלאות, views, RLS, triggers)
- **0002_rls_policies.sql** - RLS policies
- **0003_migrate_existing_data.sql** - מיגרציה של נתונים קיימים (אופציונלי)
- **0004_backfill_profiles.sql** - מילוי profiles (אופציונלי)
- **0005_global_margin.sql** - מרווח גלובלי
- **0006_Delete_reset_allDataBase.sql** - איפוס נתונים (אופציונלי)

### מיגרציות חיפוש ואופטימיזציה (7-8)
- **0007_add_search_indexes.sql** - indexes לחיפוש מהיר
- **0008_fuzzy_product_search.sql** - fuzzy search עם pg_trgm (דורש `CREATE EXTENSION pg_trgm`)

### מיגרציות ניהול משתמשים (9-10, 12-13)
- **0009_user_management.sql** - ניהול משתמשים (חסימות, audit logs)
- **0010_super_admin.sql** - מערכת super admin
- **0012_fix_memberships_display.sql** - תיקון תצוגת memberships
- **0013_fix_super_admin.sql** - תיקון super admin

### מיגרציות תכונות מוצרים (14, 17-20)
- **0014_add_product_fields.sql** - שדות מוצר נוספים (SKU, package_quantity, הנחות)
- **0017_fix_min_price_calculation.sql** - תיקון חישוב מחיר מינימום
- **0018_optimize_product_search.sql** - אופטימיזציה לחיפוש מוצרים
- **0019_change_default_margin_vat.sql** - שינוי ברירת מחדל למרווח ומע״מ
- **0020_add_package_quantity_to_price_entries.sql** - כמות יחידות באריזה למחירים

### מיגרציות הגדרות (15-16)
- **0015_add_use_margin_setting.sql** - הגדרת שימוש במרווח
- **0016_add_use_vat_setting.sql** - הגדרת שימוש במע״מ

### מיגרציות העדפות משתמש (21)
- **0021_add_user_preferences.sql** - העדפות משתמש (פריסת טבלאות וכו')

---

## 🚀 התקנה ראשונית

### שלב 1: הפעלת Extension

לפני הרצת המיגרציות, הפעל את ה-extension הנדרש:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

> ⚠️ **חשוב:** `pg_trgm` נדרש למיגרציה 0008 (fuzzy search)

### שלב 2: הרצת המיגרציות

1. פתח **Supabase Dashboard** → **SQL Editor**
2. הרץ את המיגרציות **בסדר המספרים**:
   - התחל מ-`0001_schema.sql`
   - המשך לפי הסדר: 0002, 0003, 0004...
   - סיים ב-`0021_add_user_preferences.sql`

> 💡 **טיפ:** אפשר להריץ כמה מיגרציות יחד, אבל רק אם הן רצופות ולא תלויות זו בזו.

---

## 📊 מבנה הטבלאות

### `profiles`
```sql
user_id (uuid, PK) → auth.users(id)
full_name (text)
is_super_admin (boolean) -- נוסף במיגרציה 0010
created_at (timestamptz)
```

### `tenants`
```sql
id (uuid, PK)
name (text)
created_at (timestamptz)
```

### `memberships`
```sql
id (uuid, PK)
user_id (uuid, FK) → auth.users(id)
tenant_id (uuid, FK) → tenants(id)
role (text) → 'owner' | 'worker'
is_blocked (boolean) -- נוסף במיגרציה 0009
created_at (timestamptz)
```

### `categories`
```sql
id (uuid, PK)
tenant_id (uuid, FK) → tenants(id)
name (text) -- unique when is_active=true
default_margin_percent (numeric)
is_active (boolean)
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `suppliers`
```sql
id (uuid, PK)
tenant_id (uuid, FK) → tenants(id)
name (text) -- unique when is_active=true
phone (text, optional)
notes (text, optional)
is_active (boolean)
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `products`
```sql
id (uuid, PK)
tenant_id (uuid, FK) → tenants(id)
name (text)
name_norm (text) -- normalized for duplicate detection
sku (text, optional) -- נוסף במיגרציה 0014
package_quantity (numeric, default 1) -- נוסף במיגרציה 0014
category_id (uuid, FK) → categories(id)
unit (text) → 'unit' | 'kg' | 'liter'
is_active (boolean)
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `price_entries`
```sql
id (uuid, PK)
tenant_id (uuid, FK) → tenants(id)
product_id (uuid, FK) → products(id)
supplier_id (uuid, FK) → suppliers(id)
cost_price (numeric)
discount_percent (numeric, default 0) -- נוסף במיגרציה 0014
cost_price_after_discount (numeric) -- נוסף במיגרציה 0014
margin_percent (numeric)
sell_price (numeric) -- calculated: (cost + margin) + VAT
package_quantity (numeric, optional) -- נוסף במיגרציה 0020 (תלוי בספק)
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `settings`
```sql
id (uuid, PK)
tenant_id (uuid, FK) → tenants(id)
vat_percent (numeric, default 18.00)
global_margin_percent (numeric, default 0) -- נוסף במיגרציה 0005
use_margin (boolean, default true) -- נוסף במיגרציה 0015
use_vat (boolean, default true) -- נוסף במיגרציה 0016
created_at (timestamptz)
updated_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `user_preferences`
```sql
id (uuid, PK)
user_id (uuid, FK) → auth.users(id)
tenant_id (uuid, FK) → tenants(id)
preference_key (text) -- e.g., 'table_layout_productsTable'
preference_value (jsonb) -- JSON value of the preference
created_at (timestamptz)
updated_at (timestamptz)
UNIQUE(user_id, tenant_id, preference_key)
```
> **נוסף במיגרציה 0021** - מאפשר שמירת העדפות משתמש (כמו פריסת טבלאות) פר משתמש וחנות

### `invites`
```sql
id (uuid, PK)
tenant_id (uuid, FK) → tenants(id)
email (text)
role (text) → 'owner' | 'worker'
status (text) → 'pending' | 'accepted' | 'rejected'
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `audit_logs`
```sql
id (uuid, PK)
tenant_id (uuid, FK) → tenants(id) -- nullable
user_id (uuid, FK) → profiles(user_id)
action_type (text) -- e.g., 'tenant_created', 'user_blocked'
action_data (jsonb) -- additional data about the action
created_at (timestamptz)
```
> **נוסף במיגרציה 0009** - מעקב אחר פעולות משמעותיות במערכת

---

## 🔍 Views חשובים

### `product_supplier_current_price`
מחזיר את המחיר הנוכחי (האחרון) לכל זוג מוצר-ספק, כולל:
- `cost_price` - מחיר עלות
- `discount_percent` - אחוז הנחה
- `cost_price_after_discount` - מחיר עלות לאחר הנחה
- `margin_percent` - אחוז רווח
- `sell_price` - מחיר מכירה
- `package_quantity` - כמות יחידות באריזה (תלוי בספק)

**שימוש:**
```sql
SELECT * FROM product_supplier_current_price 
WHERE tenant_id = '...' AND product_id = '...';
```

### `product_price_summary`
מחזיר סיכום מחירים לכל מוצר:
- `min_current_cost_price` - מחיר עלות נמוך ביותר (לוקח בחשבון הנחות)
- `min_current_sell_price` - מחיר מכירה נמוך ביותר
- `last_price_update_at` - תאריך עדכון אחרון

**שימוש:**
```sql
SELECT * FROM product_price_summary 
WHERE tenant_id = '...' AND product_id = '...';
```

---

## 🔐 RLS (Row Level Security)

כל הטבלאות מוגנות ב-RLS עם policies שמאפשרות:

- **SELECT** - משתמשים יכולים לראות רק נתונים של החנויות שלהם (דרך `memberships`)
- **INSERT** - משתמשים יכולים ליצור רק בחנויות שלהם
- **UPDATE** - משתמשים יכולים לעדכן רק נתונים בחנויות שלהם
- **DELETE** - soft delete (עדכון `is_active = false`)

**חשוב:**
- Super Admin (`is_super_admin = true`) יכול לגשת לכל הנתונים
- `service_role` key (ב-backend) יכול לעקוף RLS

---

## 🛠️ תחזוקה

### איפוס מסד נתונים (זהירות!)

אם אתה רוצה להתחיל מחדש:

1. פתח Supabase Dashboard → SQL Editor
2. הרץ:
```sql
-- זהירות! זה ימחק הכל!
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```
3. הפעל מחדש את `pg_trgm` extension
4. הרץ מחדש את כל המיגרציות בסדר

### בדיקת תקינות

```sql
-- בדוק שכל הטבלאות קיימות
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- בדוק שה-Views קיימים
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- בדוק שה-RLS מופעל
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- בדוק שה-extensions מופעלים
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
```

---

## 📝 הערות חשובות

1. **מיגרציות הן idempotent** - רוב המיגרציות משתמשות ב-`IF NOT EXISTS` / `IF EXISTS`, כך שאפשר להריץ אותן כמה פעמים ללא בעיה
2. **שמור גיבויים** - לפני מיגרציות גדולות, שמור גיבוי דרך Supabase Dashboard
3. **בדוק בייצור** - תמיד בדוק מיגרציות בסביבת פיתוח לפני ייצור
4. **RLS הוא חשוב** - אל תכבה RLS בייצור!
5. **סדר חשוב** - המיגרציות תלויות זו בזו, לכן חשוב להריץ אותן בסדר

---

## 🔄 עדכון מיגרציות קיימות

אם יש לך מסד נתונים קיים ורוצה לעדכן:

1. בדוק אילו מיגרציות כבר רצות (בדוק את הטבלאות/columns)
2. הרץ רק את המיגרציות החדשות (לפי המספרים)
3. ודא שהמיגרציות החדשות תואמות למבנה הקיים

---

**למדריך כללי, ראה [../README.md](../README.md)**
