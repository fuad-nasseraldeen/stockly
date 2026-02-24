# 🔐 הגדרת משתני סביבה (Environment Variables)

> עדכון 2026-02: עבור ייבוא PDF יש להוסיף גם `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` עם הרשאה `textract:AnalyzeDocument`.

מדריך מפורט להגדרת כל משתני הסביבה הנדרשים לפרויקט Stockly.

---

## 📍 מיקום הקבצים

צריך ליצור **2 קבצי .env נפרדים**:

1. `backend/.env` - משתנים לשרת ה-Backend
2. `frontend/.env` - משתנים לאפליקציית ה-Frontend

> ⚠️ **חשוב:** קבצי `.env` כבר ב-`.gitignore` - אל תעלה אותם ל-Git!

---

## 🔧 Backend (.env)

**מיקום:** `stockly/backend/.env`

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SMS_TO_API_KEY=your_sms_to_api_key_here
OTP_SECRET=your_long_random_secret_here
# Optional:
# SMS_TO_API_BASE_URL=https://api.sms.to
# REDIS_URL=
# REDIS_TOKEN=
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your_smtp_username
# SMTP_PASS=your_smtp_password_or_app_password
# CONTACT_FROM_EMAIL=auth@stockly-il.com
# CONTACT_RECEIVER_EMAIL=your_personal@email.com
# TURNSTILE_SECRET_KEY=your_turnstile_secret
```

### הסבר המשתנים:

| משתנה | תיאור | דוגמה |
|-------|-------|-------|
| `PORT` | פורט השרת (ברירת מחדל: 3001) | `3001` |
| `FRONTEND_URL` | URL של ה-Frontend (ל-CORS) | `http://localhost:5173` |
| `SUPABASE_URL` | Project URL מ-Supabase | `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | Anon Public Key מ-Supabase (נדרש לאימות טוקנים) | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Secret Key (סודי!) | `eyJhbGci...` |
| `SMS_TO_API_KEY` | API Key לשליחת SMS דרך SMS.to | `sk_live_...` |
| `OTP_SECRET` | סוד שרת ל-HMAC של קודי OTP (לפחות 16 תווים) | `long-random-secret` |
| `SMS_TO_API_BASE_URL` | (אופציונלי) כתובת API override ל-SMS.to | `https://api.sms.to` |
| `REDIS_URL` | (אופציונלי) לחיבור limiter חיצוני בעתיד | `https://...` |
| `REDIS_TOKEN` | (אופציונלי) Bearer token ל-Upstash REST | `...` |
| `SMTP_HOST` | שרת SMTP לטופס צור קשר | `smtp.gmail.com` |
| `SMTP_PORT` | פורט SMTP | `587` |
| `SMTP_USER` | משתמש SMTP | `user@example.com` |
| `SMTP_PASS` | סיסמת SMTP / App Password | `***` |
| `CONTACT_FROM_EMAIL` | כתובת השולח של הודעת הטופס | `auth@stockly-il.com` |
| `CONTACT_RECEIVER_EMAIL` | כתובת היעד לקבלת פניות | `you@example.com` |
| `TURNSTILE_SECRET_KEY` | מפתח סודי לאימות CAPTCHA בשרת | `***` |

---

## 🎨 Frontend (.env)

**מיקום:** `stockly/frontend/.env`

```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
```

### הסבר המשתנים:

| משתנה | תיאור | דוגמה |
|-------|-------|-------|
| `VITE_API_URL` | URL של ה-Backend API | `http://localhost:3001` |
| `VITE_SUPABASE_URL` | Project URL מ-Supabase | `https://abc123.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anon Public Key מ-Supabase | `eyJhbGci...` |
| `VITE_TURNSTILE_SITE_KEY` | Site key לרכיב CAPTCHA בצד לקוח | `0x4AAAA...` |

> ⚠️ **חשוב:** ב-Vite, כל משתנה חייב להתחיל ב-`VITE_` כדי להיות נגיש ב-frontend!

### עבודה בלוקאל מול Vercel (Production/Preview)

- **לוקאל/פיתוח**: שים ב־`frontend/.env` את `VITE_API_URL=http://localhost:3001` והרץ `npm run dev`.
- **Vercel**: הוסף `VITE_API_URL` ב־Project Settings → Environment Variables לכתובת ה־backend שלך (למשל `https://your-backend.vercel.app`), והגדר אותו גם ל־**Production** וגם ל־**Preview**.
- **טיפ חשוב**: אם בטעות נשאר לך `VITE_API_URL` שמצביע ל־Vercel בזמן שאתה עובד על `localhost`, הפרונט ינסה להעדיף אוטומטית `http://localhost:3001` כדי שלא “תיתקע” על פרודקשן בזמן פיתוח.

---

## 🔑 איך למצוא את ה-Keys מ-Supabase

### שלב 1: היכנס ל-Supabase Dashboard

1. פתח [Supabase Dashboard](https://supabase.com/dashboard)
2. בחר את הפרויקט שלך (או צור פרויקט חדש)

### שלב 2: עבור ל-Settings → API

1. בתפריט השמאלי, לחץ על **Settings** (⚙️)
2. לחץ על **API** בתפריט המשני

### שלב 3: העתק את הערכים

תראה 3 ערכים חשובים:

#### 1. Project URL
```
https://abcdefghijklmnop.supabase.co
```
→ זה ה-`SUPABASE_URL` / `VITE_SUPABASE_URL`

#### 2. anon public key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMn0.xxxxx
```
→ זה ה-`VITE_SUPABASE_ANON_KEY` (רק ב-frontend!)

#### 3. service_role secret key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjE2MjM5MDIyfQ.yyyyy
```
→ זה ה-`SUPABASE_SERVICE_ROLE_KEY` (רק ב-backend! ⚠️ סודי מאוד!)

> 🔒 **אזהרה:** `service_role` key הוא סודי מאוד! אל תחלוק אותו, אל תעלה אותו ל-Git, ואל תשתמש בו ב-frontend!

---

## ✅ דוגמה מלאה

### backend/.env
```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMn0.xxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjE2MjM5MDIyfQ.yyyyy
```

### frontend/.env
```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMn0.xxxxx
```

---

## 🧪 בדיקה שהכל תקין

### בדיקת Backend

```bash
cd backend
npm run dev
```

אם אין שגיאות על משתנים חסרים - הכל תקין! ✅

### בדיקת Frontend

```bash
cd frontend
npm run dev
```

אם אין שגיאות ב-Console על משתנים חסרים - הכל תקין! ✅

### בדיקה ידנית

1. פתח http://localhost:3001/health
2. צריך לראות: `{"status":"ok"}`

---

## 🐛 פתרון בעיות

### שגיאה: "SUPABASE_URL is required"

**סיבה:** המשתנה לא נטען.

**פתרונות:**
1. ודא שהקובץ `.env` נמצא בתיקייה הנכונה (`backend/` או `frontend/`)
2. ודא שאין רווחים מיותרים לפני/אחרי הערכים
3. ודא שאין גרשיים (`"`) סביב הערכים
4. הפעל מחדש את השרת

### שגיאה: "Invalid supabaseUrl"

**סיבה:** ה-URL לא תקין.

**פתרונות:**
1. ודא שה-URL מתחיל ב-`https://`
2. ודא שה-URL מסתיים ב-`.supabase.co`
3. העתק את ה-URL ישירות מ-Supabase Dashboard (לא כתוב ידנית)

### Frontend לא רואה את המשתנים

**סיבה:** המשתנים לא מתחילים ב-`VITE_`.

**פתרון:**
- ודא שכל המשתנים ב-`frontend/.env` מתחילים ב-`VITE_`
- הפעל מחדש את ה-dev server

---

## 📝 הערות חשובות

1. **אל תעלה .env ל-Git** - הקבצים כבר ב-`.gitignore`
2. **Service Role Key הוא סודי** - אל תחלוק אותו עם אף אחד
3. **Anon Key בטוח לחשיפה** - זה ה-public key, אבל עדיין לא מומלץ לחשוף אותו
4. **בייצור** - הוסף את כל המשתנים גם ב-Vercel/Netlify Environment Variables

---

## 🚀 פריסה לייצור

כשמפריסים לייצור (Vercel/Netlify), צריך להוסיף את כל משתני ה-`.env` גם ב-Environment Variables של הפלטפורמה:

1. **Vercel:** Settings → Environment Variables
2. **Netlify:** Site settings → Environment variables

הוסף את כל המשתנים (ללא קידומת `VITE_` ב-backend, עם `VITE_` ב-frontend).

---

**למדריך מפורט יותר, ראה [README.md](./README.md)**
