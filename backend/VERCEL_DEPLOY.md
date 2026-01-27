# 🚀 פריסה ל-Vercel

מדריך קצר לפריסת ה-Backend ל-Vercel.

## 📋 דרישות

1. חשבון Vercel (חינמי)
2. פרויקט Git (GitHub/GitLab/Bitbucket)
3. משתני סביבה מוגדרים

## 🔧 שלבי הפריסה

### 1. הכנת הפרויקט

הפרויקט כבר מוכן לפריסה:
- ✅ `vercel.json` מוגדר
- ✅ `api/index.ts` קיים (Serverless Function)
- ✅ `tsconfig.json` מוגדר נכון

### 2. פריסה דרך Vercel Dashboard

1. היכנס ל-[Vercel Dashboard](https://vercel.com/dashboard)
2. לחץ על **"Add New Project"**
3. בחר את ה-repository שלך
4. הגדר:
   - **Framework Preset:** Other
   - **Root Directory:** `backend` (אם הפרויקט הוא monorepo)
   - **Build Command:** `npm run build` (אופציונלי - Vercel יזהה אוטומטית)
   - **Output Directory:** (השאר ריק - לא נדרש)
   - **Install Command:** `npm install`

### 3. הגדרת משתני סביבה

ב-Vercel Dashboard → Project Settings → Environment Variables, הוסף:

```
PORT=3001
FRONTEND_URL=https://your-frontend.vercel.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_public_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> ⚠️ **חשוב:** הוסף את המשתנים גם ל-**Production**, **Preview**, ו-**Development**.

### 4. פריסה דרך CLI (אופציונלי)

```bash
cd backend
npm i -g vercel
vercel login
vercel
```

עקוב אחר ההוראות על המסך.

## 🔍 בדיקה

לאחר הפריסה, בדוק:

1. **Health Check:**
   ```
   https://your-project.vercel.app/health
   ```
   צריך להחזיר: `{"status":"ok"}`

2. **API Endpoint:**
   ```
   https://your-project.vercel.app/api/products
   ```
   צריך להחזיר שגיאת authentication (זה תקין - זה אומר שה-API עובד!)

## 🐛 פתרון בעיות

### שגיאת Build

אם ה-build נכשל:
1. בדוק את ה-logs ב-Vercel Dashboard
2. ודא ש-`npm run build` עובד מקומית
3. ודא שכל ה-dependencies מותקנות

### שגיאת Runtime

אם יש שגיאות runtime:
1. בדוק את ה-logs ב-Vercel Dashboard → Functions
2. ודא שמשתני הסביבה מוגדרים נכון
3. ודא שה-`SUPABASE_SERVICE_ROLE_KEY` נכון

### CORS Errors

אם יש שגיאות CORS:
1. ודא ש-`FRONTEND_URL` ב-Vercel תואם ל-URL של ה-frontend
2. הוסף את ה-URL של ה-frontend גם ל-CORS configuration

## 📝 הערות

- Vercel Serverless Functions ב-`api/` מתקמפלות אוטומטית
- אין צורך ב-build command נפרד (אבל אפשר להוסיף)
- ה-`vercel.json` מגדיר rewrites לכל ה-routes ל-`/api/index`

---

**למדריך כללי, ראה [../README.md](../README.md)**
