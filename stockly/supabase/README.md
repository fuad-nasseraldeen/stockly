# 🗄️ Supabase Database - מדריך מיגרציות

מדריך מפורט למיגרציות מסד הנתונים של Stockly.

---

## 📁 קבצי מיגרציה

### 1. `complete_schema.sql` - מיגרציה ראשית (חובה!)

מיגרציה זו מכילה את כל המבנה הבסיסי של מסד הנתונים:

**טבלאות:**
- `profiles` - פרופילי משתמשים
- `categories` - קטגוריות מוצרים
- `suppliers` - ספקים
- `products` - מוצרים
- `price_entries` - היסטוריית מחירים
- `settings` - הגדרות מערכת

**Views:**
- `product_current_price` - מחיר נוכחי לכל מוצר
- `product_supplier_current_price` - מחיר נוכחי לכל מוצר-ספק

**Features:**
- ✅ RLS Policies (כל המשתמשים המאומתים יכולים הכל)
- ✅ Auto-create profile trigger
- ✅ Default category "כללי"
- ✅ Unique constraints (מניעת כפילויות)
- ✅ Indexes לאופטימיזציה

**איך להריץ:**
1. פתח Supabase Dashboard → SQL Editor
2. העתק את כל התוכן מ-`complete_schema.sql`
3. לחץ על "Run"

---

### 2. `002_views_settings.sql` - Views והגדרות (מומלץ)

מיגרציה זו מוסיפה:
- View `product_supplier_current_price` - מחיר נוכחי לכל מוצר-ספק
- View `product_price_summary` - סיכום מחירים לכל מוצר
- טבלת `settings` עם מע״מ ברירת מחדל (18%)

**איך להריץ:**
1. פתח Supabase Dashboard → SQL Editor
2. העתק את כל התוכן מ-`002_views_settings.sql`
3. לחץ על "Run"

> 💡 **הערה:** אם כבר הרצת `complete_schema.sql`, חלק מהדברים כבר קיימים. המיגרציה תדלג על דברים קיימים.

---

### 3. `update_policies_RLS.sql` - עדכון RLS Policies (אם נדרש)

מיגרציה זו מעדכנת את ה-RLS Policies כדי לאפשר גם ל-`service_role` לבצע פעולות:

**מתי צריך:**
- אם אתה מקבל שגיאת RLS (`42501`) כשהבקשות מגיעות מה-backend
- אם ה-backend משתמש ב-`SUPABASE_SERVICE_ROLE_KEY`

**איך להריץ:**
1. פתח Supabase Dashboard → SQL Editor
2. העתק את כל התוכן מ-`update_policies_RLS.sql`
3. לחץ על "Run"

---

## 🔄 סדר הרצת מיגרציות

### למשתמש חדש (פרויקט חדש):

1. ✅ `complete_schema.sql` - **חובה!**
2. ✅ `002_views_settings.sql` - מומלץ
3. ⚠️ `update_policies_RLS.sql` - רק אם יש בעיות RLS

### למשתמש קיים (פרויקט קיים):

1. ✅ `002_views_settings.sql` - להוספת Views ו-Settings
2. ⚠️ `update_policies_RLS.sql` - רק אם יש בעיות RLS

---

## 📊 מבנה הטבלאות

### `profiles`
```sql
user_id (uuid, PK) → auth.users(id)
full_name (text)
role (text) → 'owner' | 'worker'
created_at (timestamptz)
```

### `categories`
```sql
id (uuid, PK)
name (text) -- unique when is_active=true
default_margin_percent (numeric)
is_active (boolean)
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `suppliers`
```sql
id (uuid, PK)
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
name (text)
name_norm (text) -- normalized for duplicate detection
category_id (uuid, FK) → categories(id)
unit (text) → 'unit' | 'kg' | 'liter'
is_active (boolean)
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `price_entries`
```sql
id (uuid, PK)
product_id (uuid, FK) → products(id)
supplier_id (uuid, FK) → suppliers(id)
cost_price (numeric)
margin_percent (numeric)
sell_price (numeric) -- calculated: (cost + margin) + VAT
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

### `settings`
```sql
id (int, PK) -- fixed to 1
vat_percent (numeric) -- default 18.00
created_at (timestamptz)
created_by (uuid) → profiles(user_id)
```

---

## 🔍 Views חשובים

### `product_supplier_current_price`
מחזיר את המחיר הנוכחי (האחרון) לכל זוג מוצר-ספק.

**שימוש:**
```sql
SELECT * FROM product_supplier_current_price 
WHERE product_id = '...';
```

### `product_price_summary`
מחזיר סיכום מחירים לכל מוצר:
- `min_current_cost_price` - מחיר עלות נמוך ביותר
- `min_current_sell_price` - מחיר מכירה נמוך ביותר
- `last_price_update_at` - תאריך עדכון אחרון

**שימוש:**
```sql
SELECT * FROM product_price_summary 
WHERE product_id = '...';
```

---

## 🔐 RLS Policies

כל המשתמשים המאומתים יכולים:
- ✅ SELECT (קריאה) מכל הטבלאות
- ✅ INSERT (יצירה) לכל הטבלאות
- ✅ UPDATE (עדכון) לכל הטבלאות
- ✅ DELETE (מחיקה) - אבל זה soft delete (is_active=false)

**חשוב:** אין הגבלות role - כל משתמש מאומת יכול לעשות הכל.

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
3. הרץ מחדש את כל המיגרציות

### בדיקת תקינות

```sql
-- בדוק שכל הטבלאות קיימות
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- בדוק שה-Views קיימים
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public';

-- בדוק שה-RLS מופעל
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

---

## 📝 הערות חשובות

1. **מיגרציות הן idempotent** - אפשר להריץ אותן כמה פעמים ללא בעיה
2. **שמור גיבויים** - לפני מיגרציות גדולות, שמור גיבוי
3. **בדוק בייצור** - תמיד בדוק מיגרציות בסביבת פיתוח לפני ייצור
4. **RLS הוא חשוב** - אל תכבה RLS בייצור!

---

**למדריך כללי, ראה [../README.md](../README.md)**
