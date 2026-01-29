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
- ✅ **ריבוי חנויות (Multi‑Tenant)** - תמיכה במספר חנויות לכל משתמש, עם תפקידים `owner` / `worker`
- ✅ **הזמנות (Invites)** - מנגנון הזמנה לפי אימייל, כולל קבלה אוטומטית של הזמנות ממתינות
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
2. הרץ את המיגרציה הבסיסית:
   ```sql
   -- העתק והדבק את התוכן מ:
   -- supabase/migrations/complete_schema.sql
   ```
3. הרץ את המיגרציות הנוספות (אם נדרש):
   ```sql
   -- supabase/migrations/002_views_settings.sql
   -- supabase/migrations/update_policies_RLS.sql
   ```

> 📝 **הערה:** המיגרציה `complete_schema.sql` מכילה את כל הטבלאות, Views, RLS Policies, ו-Triggers הנדרשים.

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
│   │   │   └── auth.ts        # Middleware לאימות JWT
│   │   ├── routes/
│   │   │   ├── products.ts   # API routes למוצרים
│   │   │   ├── categories.ts # API routes לקטגוריות
│   │   │   ├── suppliers.ts  # API routes לספקים
│   │   │   └── settings.ts   # API routes להגדרות
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
│   │   │   ├── CreateTenant.tsx # יצירת חנות חדשה (tenant)
│   │   │   └── NoAccess.tsx     # אין גישה לחנות קיימת / המתנה להזמנה
│   │   ├── components/
│   │   │   └── ui/            # רכיבי UI (Button, Card, Dialog, וכו')
│   │   ├── hooks/               # React Query hooks + עזר
│   │   │   ├── useProducts.ts
│   │   │   ├── useCategories.ts
│   │   │   ├── useSuppliers.ts
│   │   │   ├── useSettings.ts
│   │   │   └── useDebounce.ts   # דיבאונס לחיפושים
│   │   └── lib/
│   │       ├── api.ts         # API client
│   │       ├── supabase.ts    # Supabase client
│   │       ├── react-query.tsx# React Query provider
│   │       └── utils/         # פונקציות עזר
│   ├── package.json
│   └── vite.config.ts
│
└── supabase/
    └── migrations/            # מיגרציות מסד נתונים
        ├── complete_schema.sql
        ├── 002_views_settings.sql
        └── update_policies_RLS.sql
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

- **`profiles`** - פרופילי משתמשים (נוצר אוטומטית מ־auth.users)
- **`tenants`** - חנויות (סטוק) נפרדות לכל עסק
- **`memberships`** - שיוך משתמשים לחנויות + תפקיד (`owner` / `worker`)
- **`invites`** - הזמנות ממתינות לפי אימייל
- **`categories`** - קטגוריות מוצרים (עם אחוז רווח ברירת מחדל)
- **`suppliers`** - ספקים
- **`products`** - מוצרים (כולל `name_norm` לחיפוש)
- **`price_entries`** - היסטוריית מחירים (כל שינוי מחיר יוצר רשומה חדשה)
- **`settings`** - הגדרות מערכת פר חנות (מע״מ גלובלי, מרווח גלובלי)

### Views ופונקציות עזר

- **`product_supplier_current_price`** - מחיר נוכחי לכל מוצר-ספק
- **`product_price_summary`** - סיכום מחירים לכל מוצר (מינימום, תאריך עדכון אחרון)
- **`search_products_fuzzy(tenant_uuid, search_text, limit)`** - פונקציית חיפוש סלחני (fuzzy) על שמות מוצרים בעזרת `pg_trgm`

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

### API Endpoints (עיקריים)

כל ה-endpoints דורשים אימות (חוץ מ-`/health`), ורובם גם `x-tenant-id`:

```
GET    /api/products              # רשימת מוצרים (עם חיפוש/סינון/מיון)
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
```

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
- חיפוש לפי שם מוצר
- סינון לפי ספק
- סינון לפי קטגוריה
- מיון לפי מחיר (נמוך-גבוה / גבוה-נמוך)
- מיון לפי תאריך עדכון

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
