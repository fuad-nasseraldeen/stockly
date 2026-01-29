# 📦 Stockly - מערכת ניהול מלאי ומחירים

מערכת ניהול מלאי מלאה ומקצועית לניהול מוצרים, ספקים, קטגוריות ומחירים. המערכת בנויה עם React + Vite (Frontend) ו-Express + TypeScript (Backend), ומשתמשת ב-Supabase כמסד נתונים ואימות.

---

## 🛠️ טכנולוגיות

### Frontend
- **React** 19.2.0 - ספריית UI
- **TypeScript** 5.9.3 - טיפוסים סטטיים
- **Vite** 7.2.4 - Build tool ו-dev server
- **React Router DOM** 6.21.0 - ניתוב (routing)
- **React Query (@tanstack/react-query)** 5.90.19 - ניהול state ושרתים (caching, synchronization)
- **Tailwind CSS** 4.0.0 - עיצוב utility-first
- **Supabase JS** 2.91.0 - לקוח Supabase לאימות ומסד נתונים
- **React Hook Form** 7.71.1 - ניהול טפסים
- **Zod** 4.3.5 - ולידציה של סכמות
- **Lucide React** 0.562.0 - ספריית אייקונים
- **XLSX** 0.18.5 - קריאה וכתיבה של קבצי Excel
- **class-variance-authority** 0.7.1 - ניהול variants של קומפוננטות
- **clsx** & **tailwind-merge** - שילוב classes של Tailwind

### Backend
- **Node.js** 18+ - סביבת הרצה
- **Express** 4.18.2 - מסגרת web server
- **TypeScript** 5.3.3 - טיפוסים סטטיים
- **Supabase JS** 2.91.0 - לקוח Supabase (service role)
- **Multer** 1.4.5 - טיפול בהעלאת קבצים
- **XLSX** 0.18.5 - פענוח קבצי Excel
- **Zod** 4.3.5 - ולידציה של נתונים
- **CORS** 2.8.5 - ניהול Cross-Origin Resource Sharing
- **dotenv** 16.6.1 - ניהול משתני סביבה
- **tsx** 4.7.0 - הרצת TypeScript ישירות (dev)

### Database & Infrastructure
- **PostgreSQL** (דרך Supabase) - מסד נתונים יחסי
- **Supabase** - Backend-as-a-Service:
  - **Supabase Auth** - אימות משתמשים (JWT)
  - **Supabase Database** - PostgreSQL מנוהל
  - **Row Level Security (RLS)** - אבטחה ברמת שורה
  - **PostgREST** - REST API אוטומטי
- **pg_trgm** - הרחבת PostgreSQL לחיפוש fuzzy (tolerance לשגיאות כתיב)

### Development Tools
- **ESLint** 9.39.1 - בדיקת איכות קוד
- **TypeScript ESLint** 8.46.4 - כללי linting ל-TypeScript
- **Git** - ניהול גרסאות

### Deployment
- **Vercel** - פריסת Frontend ו-Backend
- **Supabase Cloud** - אירוח מסד נתונים ואימות

---

## 🎯 תכונות עיקריות

- ✅ **ניהול מוצרים** - יצירה, עריכה, מחיקה רכה, חיפוש וסינון מתקדם
- ✅ **ניהול ספקים** - CRUD מלא עם היסטוריית מחירים לכל ספק ומוצר
- ✅ **ניהול קטגוריות** - עם אחוז רווח ברירת מחדל (כולל מרווח גלובלי)
- ✅ **היסטוריית מחירים** - מעקב מלא אחר שינויי מחירים + דיאלוג היסטוריה ייעודי
- ✅ **חישוב מחיר מכירה אוטומטי** - עלות + רווח + מע״מ (כולל הצגת *מחיר לפני מע״מ*)
- ✅ **ייבוא/ייצוא מאקסל/CSV** - מסך `ייבוא/ייצוא` לטעינת מוצרים ומחירים + איפוס נתוני חנות
- ✅ **מניעת כפילויות** - בדיקה אוטומטית של מוצרים/ספקים/קטגוריות זהים (normalized)
- ✅ **חיפוש מהיר עם Debounce** - קריאת API רק אחרי עצירה קצרה בהקלדה
- ✅ **חיפוש סלחני (Fuzzy Search)** - מבוסס `pg_trgm` ב-Postgres, תופס טעויות כתיב קטנות
- ✅ **חיפוש קצר (2 תווים)** - משתמש ב-ILIKE לחיפושים קצרים, fuzzy search לחיפושים ארוכים
- ✅ **Pagination בשרת** - טעינה יעילה של מוצרים עם pagination בשרת (10 מוצרים לעמוד)
- ✅ **Cache לתוצאות חיפוש** - cache בזיכרון (5 דקות) לחיפושים חוזרים, מהיר יותר
- ✅ **ריבוי חנויות (Multi‑Tenant)** - תמיכה במספר חנויות לכל משתמש, עם תפקידים `owner` / `worker`
- ✅ **הזמנות (Invites)** - מנגנון הזמנה לפי אימייל, כולל קבלה אוטומטית של הזמנות ממתינות
- ✅ **Super Admin System** - מערכת ניהול מערכת למנהל האפליקציה (`fuad@owner.com`)
- ✅ **Admin Panel** - דף ניהול מערכת לצפייה בכל החנויות, משתמשים, ופעילות
- ✅ **ניהול משתמשים** - חסימה/ביטול חסימה של משתמשים, הסרת משתמשים מחנויות
- ✅ **ניהול חנויות** - איפוס נתונים, מחיקת חנויות, צפייה בסטטיסטיקות
- ✅ **Audit Logs** - מעקב אחר פעולות משמעותיות במערכת
- ✅ **עברית RTL** - ממשק משתמש מלא בעברית עם תמיכה מלאה ב-RTL
- ✅ **עיצוב Mobile-First** - מותאם מושלם למובייל עם תפריט hamburger
- ✅ **PWA Ready** - מוכן להתקנה כאפליקציה
- ✅ **אימות משתמשים** - באמצעות Supabase Auth

---

## 📋 דרישות מערכת

- **Node.js** 18+ 
- **npm** 9+ (או yarn/pnpm)
- **חשבון Supabase** (חינמי)
- **Git** (לשיבוט הפרויקט)

---

## 🚀 התקנה מהירה

### 1. שיבוט הפרויקט

```bash
git clone <repository-url>
cd stockly
```

### 2. התקנת תלויות

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd ../frontend
npm install
```

### 3. הגדרת Supabase

1. היכנס ל-[Supabase Dashboard](https://supabase.com/dashboard)
2. צור פרויקט חדש (או השתמש בפרויקט קיים)
3. העתק את ה-URL וה-Keys:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

### 4. הגדרת משתני סביבה

**יצירת קובץ `backend/.env`:**
```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key
```

**יצירת קובץ `frontend/.env`:**
```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key
```

> ⚠️ **חשוב:** 
> - אל תעלה את קבצי ה-.env ל-Git!
> - `SUPABASE_SERVICE_ROLE_KEY` הוא סודי - השתמש בו רק ב-backend
> - `VITE_` קידומת נדרשת למשתנים ב-frontend (Vite)

### 5. הגדרת מסד הנתונים

1. פתח את **Supabase Dashboard** → **SQL Editor**
2. הרץ את המיגרציות בסדר הבא:
   ```sql
   -- 1. סכמה בסיסית
   -- supabase/migrations/0001_schema.sql
   
   -- 2. RLS Policies
   -- supabase/migrations/0002_rls_policies.sql
   
   -- 3. Indexes לחיפוש
   -- supabase/migrations/0007_add_search_indexes.sql
   
   -- 4. Fuzzy search (חובה להפעיל pg_trgm קודם!)
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   -- supabase/migrations/0008_fuzzy_product_search.sql
   
   -- 5. ניהול משתמשים
   -- supabase/migrations/0009_user_management.sql
   
   -- 6. Super Admin
   -- supabase/migrations/0010_super_admin.sql
   ```

> 📝 **חשוב:** 
> - המיגרציות צריכות לרוץ בסדר (לפי המספרים)
> - `pg_trgm` extension צריך להיות מופעל לפני מיגרציה 0008
> - Super Admin (`fuad@owner.com`) נוצר אוטומטית במיגרציה 0010

### 6. הפעלת הפרויקט

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

המערכת תהיה זמינה ב:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001

---

## 📁 מבנה הפרויקט

```
stockly/
├── backend/                    # Express Backend
│   ├── src/
│   │   ├── app.ts             # הגדרת Express app
│   │   ├── server.ts          # נקודת כניסה לשרת
│   │   ├── middleware/
│   │   │   └── auth.ts        # Middleware לאימות JWT, tenant, super admin
│   │   ├── routes/
│   │   │   ├── products.ts   # API routes למוצרים (עם pagination ו-cache)
│   │   │   ├── categories.ts # API routes לקטגוריות
│   │   │   ├── suppliers.ts  # API routes לספקים
│   │   │   ├── settings.ts   # API routes להגדרות
│   │   │   ├── tenants.ts    # API routes לניהול חנויות
│   │   │   ├── invites.ts     # API routes להזמנות
│   │   │   ├── import.ts      # API routes לייבוא
│   │   │   ├── export.ts      # API routes לייצוא
│   │   │   ├── reset.ts       # API routes לאיפוס נתונים
│   │   │   └── admin.ts       # API routes לניהול מערכת (super admin)
│   │   └── lib/
│   │       ├── supabase.ts   # Supabase client
│   │       ├── pricing.ts    # פונקציות חישוב מחירים
│   │       └── normalize.ts  # נרמול שמות
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── App.tsx            # רכיב ראשי + routing + OnboardingRouter
│   │   ├── main.tsx           # נקודת כניסה
│   │   ├── pages/
│   │   │   ├── Login.tsx        # דף התחברות
│   │   │   ├── Signup.tsx       # דף הרשמה
│   │   │   ├── Products.tsx     # רשימת מוצרים + מחירים + חיפוש מתקדם
│   │   │   ├── NewProduct.tsx   # הוספת מוצר חדש
│   │   │   ├── EditProduct.tsx  # עריכת מוצר + הוספת מחירים
│   │   │   ├── Categories.tsx   # ניהול קטגוריות
│   │   │   ├── Suppliers.tsx    # ניהול ספקים
│   │   │   ├── ImportExport.tsx # ייבוא/ייצוא + איפוס נתונים
│   │   │   ├── Settings.tsx     # הגדרות מערכת (מע״מ, פרופיל משתמש)
│   │   │   ├── Admin.tsx         # דף ניהול מערכת (super admin בלבד)
│   │   │   ├── CreateTenant.tsx # יצירת חנות חדשה (tenant)
│   │   │   └── NoAccess.tsx     # אין גישה לחנות קיימת / המתנה להזמנה
│   │   ├── components/
│   │   │   └── ui/            # רכיבי UI (Button, Card, Dialog, וכו')
│   │   ├── hooks/               # React Query hooks + עזר
│   │   │   ├── useProducts.ts
│   │   │   ├── useCategories.ts
│   │   │   ├── useSuppliers.ts
│   │   │   ├── useSettings.ts
│   │   │   ├── useDebounce.ts   # דיבאונס לחיפושים
│   │   │   ├── useSuperAdmin.ts # בדיקת super admin status
│   │   │   ├── useAdmin.ts      # hooks לניהול מערכת
│   │   │   └── useTenant.ts     # hook לניהול tenant
│   │   └── lib/
│   │       ├── api.ts         # API client
│   │       ├── supabase.ts    # Supabase client
│   │       ├── react-query.tsx# React Query provider
│   │       └── utils/         # פונקציות עזר
│   ├── package.json
│   └── vite.config.ts
│
├── .github/
│   └── workflows/
│       └── backup.yml        # GitHub Actions workflow לגיבוי אוטומטי
├── scripts/
│   ├── backup.sh              # Script גיבוי ל-Linux/Mac
│   └── backup.ps1            # Script גיבוי ל-Windows
├── BACKUP_SETUP.md            # מדריך מפורט להגדרת גיבוי אוטומטי
└── supabase/
    └── migrations/            # מיגרציות מסד נתונים
        ├── 0001_schema.sql              # סכמה בסיסית (טבלאות, views, RLS)
        ├── 0002_rls_policies.sql        # RLS policies
        ├── 0003_migrate_existing_data.sql  # מיגרציה של נתונים קיימים
        ├── 0004_backfill_profiles.sql   # מילוי profiles
        ├── 0005_global_margin.sql       # מרווח גלובלי
        ├── 0006_Delete_reset_allDataBase.sql  # איפוס נתונים
        ├── 0007_add_search_indexes.sql # indexes לחיפוש
        ├── 0008_fuzzy_product_search.sql  # fuzzy search עם pg_trgm
        ├── 0009_user_management.sql     # ניהול משתמשים (חסימות, audit logs)
        ├── 0010_super_admin.sql         # מערכת super admin
        ├── 0012_fix_memberships_display.sql  # תיקון תצוגת memberships
        └── 0013_fix_super_admin.sql     # תיקון super admin
```

---

## 🔧 פיתוח

### Backend Scripts

```bash
cd backend

# פיתוח (watch mode)
npm run dev

# בנייה לייצור
npm run build

# הפעלה בייצור
npm start
```

### Frontend Scripts

```bash
cd frontend

# פיתוח (dev server)
npm run dev

# בנייה לייצור
npm run build

# תצוגה מקדימה של build
npm run preview

# בדיקת lint
npm run lint
```

---

## 🗄️ מבנה מסד הנתונים

### טבלאות עיקריות

- **`profiles`** - פרופילי משתמשים (נוצר אוטומטית מ־auth.users), כולל `is_super_admin`
- **`tenants`** - חנויות (סטוק) נפרדות לכל עסק
- **`memberships`** - שיוך משתמשים לחנויות + תפקיד (`owner` / `worker`), כולל `is_blocked`
- **`invites`** - הזמנות ממתינות לפי אימייל
- **`categories`** - קטגוריות מוצרים (עם אחוז רווח ברירת מחדל)
- **`suppliers`** - ספקים
- **`products`** - מוצרים (כולל `name_norm` לחיפוש)
- **`price_entries`** - היסטוריית מחירים (כל שינוי מחיר יוצר רשומה חדשה)
- **`settings`** - הגדרות מערכת פר חנות (מע״מ גלובלי, מרווח גלובלי)
- **`audit_logs`** - יומן פעולות (יצירת חנויות, הצטרפות משתמשים, חסימות, וכו')

### Views ופונקציות עזר

- **`product_supplier_current_price`** - מחיר נוכחי לכל מוצר-ספק
- **`product_price_summary`** - סיכום מחירים לכל מוצר (מינימום, תאריך עדכון אחרון)
- **`search_products_fuzzy(tenant_uuid, search_text, limit)`** - פונקציית חיפוש סלחני (fuzzy) על שמות מוצרים בעזרת `pg_trgm`
- **`auto_grant_super_admin()`** - פונקציה אוטומטית להענקת super admin למשתמש `fuad@owner.com`

### RLS (Row Level Security)

- כל הנתונים *מופרדים פר‑חנות* ע״י `tenant_id`.
- גישה מתבצעת רק אם למשתמש יש חברות (`memberships`) מתאימה בחנות.
- פעולות רגישות (הזמנות, איפוס טננט) מוגבלות ל‑`owner` בלבד.

ראה פירוט נוסף בקובץ `ONBOARDING_IMPLEMENTATION.md`.

---

## 🔐 אימות ואבטחה

### Authentication & Onboarding Flow

1. המשתמש נרשם/מתחבר דרך Supabase Auth (frontend)
2. Supabase מחזיר JWT token
3. Frontend שולח את ה-token ב-header `Authorization: Bearer <token>`
4. Backend מאמת את ה-token באמצעות `requireAuth` middleware
5. אם ה-token תקין, הבקשה ממשיכה
6. `OnboardingRouter` ב-frontend מקבל הזמנות ממתינות (`/api/invites/accept`) ומטען את החנויות של המשתמש

### Super Admin System

- **מנהל האפליקציה:** `fuad@owner.com` מקבל אוטומטית הרשאות super admin
- **גישה:** Super admin יכול לגשת ל-`/admin` גם בלי שייכות לחנויות
- **תכונות:**
  - צפייה בכל החנויות והמשתמשים
  - חסימה/ביטול חסימה של משתמשים
  - הסרת משתמשים מחנויות
  - איפוס נתוני חנות
  - מחיקת חנויות
  - צפייה ב-audit logs
  - סטטיסטיקות לכל חנות (מוצרים, ספקים, קטגוריות, נפח DB)

### API Endpoints (עיקריים)

כל ה-endpoints דורשים אימות (חוץ מ-`/health`), ורובם גם `x-tenant-id`:

```
GET    /api/products?page=1&pageSize=10&search=...&sort=...  # רשימת מוצרים (עם pagination, חיפוש/סינון/מיון)
GET    /api/products/:id          # פרטי מוצר
POST   /api/products              # יצירת מוצר + מחיר ראשוני
PUT    /api/products/:id          # עדכון מוצר
DELETE /api/products/:id          # מחיקה רכה של מוצר
POST   /api/products/:id/prices   # הוספת מחיר חדש למוצר
GET    /api/products/:id/price-history?supplier_id=  # היסטוריית מחירים

GET    /api/categories            # רשימת קטגוריות
POST   /api/categories             # יצירת קטגוריה
PUT    /api/categories/:id        # עדכון קטגוריה
DELETE /api/categories/:id        # מחיקה רכה (מוצרים עוברים ל"כללי")

GET    /api/suppliers             # רשימת ספקים
POST   /api/suppliers             # יצירת ספק
PUT    /api/suppliers/:id         # עדכון ספק
DELETE /api/suppliers/:id        # מחיקה רכה

GET    /api/settings              # הגדרות מערכת
PUT    /api/settings              # עדכון הגדרות
PUT    /api/settings/recalculate-prices  # חישוב מחדש של כל המחירים
PUT    /api/settings/recalculate-prices-by-category/:id  # חישוב מחדש לפי קטגוריה

GET    /api/tenants               # רשימת חנויות של המשתמש
POST   /api/tenants               # יצירת חנות חדשה (owner)
POST   /api/tenants/:id/invite    # הזמנת משתמש לפי אימייל (owner-only)
POST   /api/invites/accept        # קבלת כל ההזמנות הממתינות למשתמש

POST   /api/import/preview        # תצוגה מקדימה לייבוא אקסל/CSV
POST   /api/import/apply?mode=…   # ביצוע ייבוא (merge/overwrite)
POST   /api/tenant/reset          # איפוס כל נתוני החנות (owner-only)

# Admin Endpoints (Super Admin בלבד)
GET    /api/admin/check           # בדיקת super admin status
GET    /api/admin/tenants         # רשימת כל החנויות עם משתמשים וסטטיסטיקות
GET    /api/admin/audit-logs      # יומן פעולות (audit logs)
POST   /api/admin/block-user      # חסימת משתמש בחנות
POST   /api/admin/unblock-user    # ביטול חסימת משתמש
DELETE /api/admin/remove-user     # הסרת משתמש מחנות
POST   /api/admin/reset-tenant-data  # איפוס נתוני חנות
DELETE /api/admin/delete-tenant      # מחיקת חנות לחלוטין
```

> **הערה:** כל ה-admin endpoints דורשים `requireSuperAdmin` middleware ורק `fuad@owner.com` יכול לגשת אליהם.

---

## 🎨 תכונות UI/UX

### עברית RTL
- כל הממשק בעברית עם תמיכה מלאה ב-RTL
- טיפוגרפיה מותאמת לעברית
- תפריט ניווט מותאם למובייל (hamburger menu)

### Mobile-First Design
- עיצוב responsive מלא
- תפריט hamburger למובייל
- טבלאות מותאמות למסכים קטנים
- כפתורים וקלטים מותאמים למגע

### חיפוש וסינון
- חיפוש לפי שם מוצר (עם debounce)
- חיפוש סלחני (fuzzy search) - תופס שגיאות כתיב קטנות
- חיפוש קצר (2 תווים) - משתמש ב-ILIKE לחיפושים קצרים
- סינון לפי ספק
- סינון לפי קטגוריה
- מיון לפי מחיר (נמוך-גבוה / גבוה-נמוך)
- מיון לפי תאריך עדכון
- Pagination - 10 מוצרים לעמוד עם ניווט בין עמודים
- Cache - תוצאות חיפוש נשמרות ב-cache (5 דקות) למהירות

---

## 📝 דוגמאות שימוש

### יצירת מוצר חדש

1. לחץ על "הוסף מוצר"
2. הזן שם מוצר, בחר קטגוריה (או השאר "כללי")
3. בחר ספק (או צור ספק חדש)
4. הזן מחיר עלות ואחוז רווח (אופציונלי)
5. המערכת מחשבת אוטומטית את מחיר המכירה (עלות + רווח + מע״מ)

### הוספת מחיר חדש למוצר קיים

1. עבור לדף "מוצרים"
2. לחץ על "ערוך" ליד המוצר
3. לחץ על "הוסף מחיר חדש"
4. בחר ספק והזן מחיר עלות
5. המחיר החדש מתווסף להיסטוריה (לא מחליף את הישן)

### ניהול ספקים

1. עבור לדף "ספקים"
2. לחץ על "הוסף ספק" (שם חובה, טלפון והערות אופציונליים)
3. ערוך או מחק ספקים קיימים
4. מחיקת ספק עם מחירים קיימים תציג אזהרה

---

## ⚡ ביצועים ואופטימיזציה

### Pagination בשרת
- **Pagination יעיל:** השרת מחזיר רק את העמוד הנוכחי (10 מוצרים)
- **Cache לתוצאות חיפוש:** תוצאות חיפוש נשמרות ב-cache (5 דקות) למהירות
- **שיפור ביצועים:** כ-27% שיפור בזמן טעינה (מ-2.86s ל-2.08s)

### Indexes במסד הנתונים
- **Indexes לחיפוש:** `products_name_norm_search_idx`, `products_name_norm_trgm_idx`
- **Indexes ל-sorting:** `price_entries_tenant_product_created_idx`
- **Indexes ל-RLS:** `memberships_user_idx`, `memberships_tenant_idx`

### חיפוש
- **Fuzzy Search:** מבוסס `pg_trgm` עם threshold של 0.2
- **חיפוש קצר:** חיפוש של 2 תווים או פחות משתמש ב-ILIKE
- **Debounce:** חיפוש עם debounce של 350ms בפרונט-אנד

### Cache
- **In-memory cache:** תוצאות חיפוש נשמרות ב-cache (5 דקות TTL)
- **Auto-cleanup:** Cache מנקה אוטומטית entries ישנים (שומר רק 100 אחרונים)

---

## 💾 גיבויים ואבטחת נתונים

### גיבוי אוטומטי (מומלץ)
- **GitHub Actions + Google Drive:** מערכת גיבוי אוטומטית מלאה
- **תדירות:** גיבוי אוטומטי כל יום ב-2:00 UTC (4:00 בבוקר שעון ישראל)
- **אחסון:** Google Drive (לצמיתות) + GitHub Artifacts (7 ימים)
- **אוטומציה:** לא צריך לעשות כלום - הכל אוטומטי!
- **הגדרה:** ראה `BACKUP_SETUP.md` להוראות מפורטות

### Supabase Backups
- **גיבויים אוטומטיים:** Supabase עושה גיבויים אוטומטיים (תלוי בתוכנית)
- **Point-in-Time Recovery:** ניתן לשחזר נתונים לנקודת זמן ספציפית
- **המלצה:** ודא שגיבויים מופעלים ב-Supabase Dashboard → Settings → Database → Backups

### גיבוי ידני
- **pg_dump:** ניתן להריץ גיבוי ידני עם `scripts/backup.sh` (Linux/Mac) או `scripts/backup.ps1` (Windows)
- **Supabase Dashboard:** ניתן לייצא דרך Supabase Dashboard → Database → Backups → Export

### Soft Delete
- **מחיקה רכה:** מוצרים, ספקים, קטגוריות משתמשים ב-`is_active = false` במקום מחיקה
- **שחזור:** ניתן לשחזר נתונים שנמחקו בטעות (עדכון `is_active = true`)

### Audit Logs
- **יומן פעולות:** כל פעולה משמעותית נרשמת ב-`audit_logs`
- **סוגי פעולות:** `tenant_created`, `user_joined`, `user_blocked`, `invite_sent`
- **גישה:** Super admin יכול לצפות ב-audit logs דרך דף הניהול

### Export/Import
- **ייצוא נתונים:** ניתן לייצא את כל הנתונים דרך דף ייבוא/ייצוא
- **ייבוא נתונים:** ניתן לייבא נתונים מקבצי Excel/CSV
- **איפוס נתונים:** ניתן לאפס את כל נתוני החנות (owner-only)

---

## 🐛 פתרון בעיות

### שגיאת "SUPABASE_URL is required"

**סיבה:** משתני סביבה לא נטענו.

**פתרון:**
1. ודא שקובץ `.env` קיים ב-`backend/` או `frontend/`
2. ודא שהמשתנים כתובים נכון (ללא רווחים מיותרים)
3. הפעל מחדש את השרת

### שגיאת CORS

**סיבה:** ה-backend לא מאפשר את ה-origin של ה-frontend.

**פתרון:**
1. ודא ש-`FRONTEND_URL` ב-`backend/.env` תואם ל-URL של ה-frontend
2. בדרך כלל: `FRONTEND_URL=http://localhost:5173`

### שגיאת RLS (Row Level Security)

**סיבה:** RLS policies לא מאפשרים גישה.

**פתרון:**
1. הרץ את המיגרציה `update_policies_RLS.sql` ב-Supabase SQL Editor
2. ודא שה-`SUPABASE_SERVICE_ROLE_KEY` נכון ב-`backend/.env`

### Frontend לא מתחבר ל-Backend

**סיבה:** `VITE_API_URL` לא נכון או ה-backend לא רץ.

**פתרון:**
1. ודא שה-backend רץ על הפורט הנכון (ברירת מחדל: 3001)
2. ודא ש-`VITE_API_URL=http://localhost:3001` ב-`frontend/.env`
3. בדוק ב-Console של הדפדפן אם יש שגיאות CORS או network

---

## 🚢 פריסה לייצור

### Backend (Vercel/Netlify Functions)

הפרויקט מוכן לפריסה ב-Vercel עם `vercel.json`:

```bash
cd backend
vercel deploy
```

### Frontend (Vercel/Netlify)

```bash
cd frontend
npm run build
# העלה את תיקיית dist/ ל-Vercel/Netlify
```

### משתני סביבה בייצור

הוסף את כל משתני ה-`.env` ב-Vercel Dashboard → Settings → Environment Variables.

---

## 📚 משאבים נוספים

- [Supabase Documentation](https://supabase.com/docs)
- [React Router Documentation](https://reactrouter.com/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

## 📄 רישיון

פרויקט זה הוא פרויקט פרטי.

---

## 👤 תמיכה

לשאלות או בעיות, פתח issue ב-repository או צור קשר עם המפתח.

---

**נבנה עם ❤️ ב-React, TypeScript, Express, Supabase, PostgreSQL, ו-Tailwind CSS**
