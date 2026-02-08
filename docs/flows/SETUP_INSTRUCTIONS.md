# 🛠️ הוראות התקנה והגדרה מפורטות

מדריך שלב-אחר-שלב להגדרת הפרויקט Stockly מההתחלה.

---

## 📋 תוכן עניינים

1. [דרישות מוקדמות](#דרישות-מוקדמות)
2. [התקנת תלויות](#התקנת-תלויות)
3. [הגדרת Supabase](#הגדרת-supabase)
4. [הגדרת משתני סביבה](#הגדרת-משתני-סביבה)
5. [הגדרת מסד נתונים](#הגדרת-מסד-נתונים)
6. [הפעלת הפרויקט](#הפעלת-הפרויקט)
7. [בדיקת תקינות](#בדיקת-תקינות)

---

## 🔧 דרישות מוקדמות

לפני שמתחילים, ודא שיש לך:

- ✅ **Node.js** גרסה 18 או גבוהה יותר
  ```bash
  node --version  # צריך להציג v18.x.x או גבוה יותר
  ```
- ✅ **npm** גרסה 9 או גבוהה יותר
  ```bash
  npm --version  # צריך להציג 9.x.x או גבוה יותר
  ```
- ✅ **חשבון Supabase** (חינמי)
  - הירשם ב-[supabase.com](https://supabase.com)
- ✅ **Git** (לשיבוט הפרויקט)

---

## 📦 התקנת תלויות

### שלב 1: שיבוט/הורדת הפרויקט

אם הפרויקט ב-Git:
```bash
git clone <repository-url>
cd stockly
```

אם יש לך את הקבצים כבר:
```bash
cd stockly
```

### שלב 2: התקנת Backend Dependencies

```bash
cd backend
npm install
```

זה יתקין את כל החבילות:
- `express` - שרת web
- `@supabase/supabase-js` - לקוח Supabase
- `zod` - validation
- `cors` - CORS middleware
- `dotenv` - ניהול משתני סביבה

### שלב 3: התקנת Frontend Dependencies

```bash
cd ../frontend
npm install
```

זה יתקין את כל החבילות:
- `react` + `react-dom` - ספריית React
- `react-router-dom` - routing
- `@tanstack/react-query` - ניהול state
- `@supabase/supabase-js` - לקוח Supabase
- `tailwindcss` - עיצוב
- `lucide-react` - אייקונים

---

## ☁️ הגדרת Supabase

### שלב 1: יצירת פרויקט

1. היכנס ל-[Supabase Dashboard](https://supabase.com/dashboard)
2. לחץ על **"New Project"**
3. מלא את הפרטים:
   - **Name:** Stockly (או שם אחר)
   - **Database Password:** בחר סיסמה חזקה (שמור אותה!)
   - **Region:** בחר את האזור הקרוב אליך
4. לחץ על **"Create new project"**
5. חכה כמה דקות עד שהפרויקט נוצר

### שלב 2: קבלת ה-Keys

1. בתפריט השמאלי, לחץ על **Settings** (⚙️)
2. לחץ על **API**
3. העתק את הערכים הבאים (תצטרך אותם בהמשך):
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - **service_role secret** key → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ **חשוב:** שמור את ה-`service_role` key בסוד! הוא נותן גישה מלאה למסד הנתונים.

---

## 🔐 הגדרת משתני סביבה

### יצירת קובץ Backend .env

```bash
cd backend
touch .env  # או צור את הקובץ ידנית
```

פתח את הקובץ והוסף:

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key_here
```

**החלף:**
- `your-project-id` → ה-Project ID שלך מ-Supabase
- `your_service_role_secret_key_here` → ה-service_role key שהעתקת

### יצירת קובץ Frontend .env

```bash
cd ../frontend
touch .env  # או צור את הקובץ ידנית
```

פתח את הקובץ והוסף:

```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
```

**החלף:**
- `your-project-id` → אותו Project ID כמו ב-backend
- `your_anon_public_key_here` → ה-anon public key שהעתקת

> 📖 **למדריך מפורט יותר:** ראה [ENV_SETUP.md](./ENV_SETUP.md)

---

## 🗄️ הגדרת מסד נתונים

### שלב 1: פתיחת SQL Editor

1. ב-Supabase Dashboard, לחץ על **SQL Editor** בתפריט השמאלי
2. לחץ על **"New query"**

### שלב 2: הפעלת Extension

לפני הרצת המיגרציות, הפעל את ה-extension הנדרש:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

> ⚠️ **חשוב:** `pg_trgm` נדרש למיגרציה 0008 (fuzzy search)

### שלב 3: הרצת המיגרציות

1. פתח את הקובץ: `supabase/migrations/0001_schema.sql`
2. העתק את כל התוכן
3. הדבק ב-SQL Editor
4. לחץ על **"Run"** (או Ctrl+Enter)

המיגרציה תצור:
- ✅ כל הטבלאות (profiles, tenants, memberships, categories, suppliers, products, price_entries, settings)
- ✅ כל ה-Views (product_supplier_current_price, product_price_summary)
- ✅ כל ה-RLS Policies
- ✅ Triggers (auto-create profile, update name_norm)
- ✅ קטגוריית ברירת מחדל "כללי"

### שלב 4: הרצת מיגרציות נוספות

הרץ את המיגרציות הנוספות **בסדר המספרים**:
- `0002_rls_policies.sql` - RLS policies
- `0003_migrate_existing_data.sql` - מיגרציה של נתונים קיימים (אופציונלי)
- `0004_backfill_profiles.sql` - מילוי profiles (אופציונלי)
- `0005_global_margin.sql` - מרווח גלובלי
- `0006_Delete_reset_allDataBase.sql` - איפוס נתונים (אופציונלי)
- `0007_add_search_indexes.sql` - indexes לחיפוש
- `0008_fuzzy_product_search.sql` - fuzzy search (דורש pg_trgm)
- `0009_user_management.sql` - ניהול משתמשים
- `0010_super_admin.sql` - מערכת super admin
- `0012_fix_memberships_display.sql` - תיקון תצוגת memberships
- `0013_fix_super_admin.sql` - תיקון super admin
- `0014_add_product_fields.sql` - שדות מוצר נוספים (SKU, הנחות)
- `0015_add_use_margin_setting.sql` - הגדרת שימוש במרווח
- `0016_add_use_vat_setting.sql` - הגדרת שימוש במע״מ
- `0017_fix_min_price_calculation.sql` - תיקון חישוב מחיר מינימום
- `0018_optimize_product_search.sql` - אופטימיזציה לחיפוש
- `0019_change_default_margin_vat.sql` - שינוי ברירת מחדל
- `0020_add_package_quantity_to_price_entries.sql` - כמות יחידות באריזה
- `0021_add_user_preferences.sql` - העדפות משתמש

> 💡 **טיפ:** ראה [supabase/README.md](../../supabase/README.md) לפרטים מלאים על כל המיגרציות.

---

## 🚀 הפעלת הפרויקט

### Terminal 1: Backend Server

```bash
cd backend
npm run dev
```

צריך לראות:
```
🚀 Backend server running on http://localhost:3001
```

### Terminal 2: Frontend Dev Server

```bash
cd frontend
npm run dev
```

צריך לראות:
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### פתיחת האפליקציה

פתח בדפדפן: **http://localhost:5173**

---

## ✅ בדיקת תקינות

### בדיקה 1: Backend Health Check

פתח בדפדפן: **http://localhost:3001/health**

צריך לראות:
```json
{"status":"ok"}
```

### בדיקה 2: Frontend Loading

פתח: **http://localhost:5173**

צריך לראות דף התחברות בעברית.

### בדיקה 3: יצירת משתמש

1. לחץ על "הרשמה"
2. מלא פרטים:
   - שם מלא
   - אימייל
   - סיסמה
3. לחץ על "הירשם"
4. אם זה עובד - הכל תקין! ✅

### בדיקה 4: יצירת מוצר

1. לאחר התחברות, לחץ על "הוסף מוצר"
2. הזן שם מוצר
3. בחר ספק (או צור חדש)
4. הזן מחיר
5. שמור

אם המוצר נוצר - הכל עובד מושלם! 🎉

---

## 🐛 פתרון בעיות נפוצות

### בעיה: "SUPABASE_URL is required"

**פתרון:**
1. ודא שקובץ `.env` קיים ב-`backend/` או `frontend/`
2. ודא שהמשתנים כתובים נכון (ללא רווחים מיותרים)
3. הפעל מחדש את השרת

### בעיה: CORS Error

**פתרון:**
1. ודא ש-`FRONTEND_URL` ב-`backend/.env` תואם ל-URL של ה-frontend
2. בדרך כלל: `FRONTEND_URL=http://localhost:5173`

### בעיה: RLS Policy Error

**פתרון:**
1. הרץ את `supabase/migrations/update_policies_RLS.sql` ב-SQL Editor
2. ודא שה-`SUPABASE_SERVICE_ROLE_KEY` נכון

### בעיה: Frontend לא מתחבר ל-Backend

**פתרון:**
1. ודא שה-backend רץ (פתח http://localhost:3001/health)
2. ודא ש-`VITE_API_URL=http://localhost:3001` ב-`frontend/.env`
3. בדוק ב-Console של הדפדפן אם יש שגיאות

---

## 📚 משאבים נוספים

- [README.md](./README.md) - מדריך כללי מקיף
- [QUICK_START.md](./QUICK_START.md) - התחלה מהירה
- [ENV_SETUP.md](./ENV_SETUP.md) - מדריך מפורט למשתני סביבה

---

**בהצלחה! 🚀**
