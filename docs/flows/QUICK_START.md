# ⚡ Quick Start - התחלה מהירה

מדריך מהיר להתחלת עבודה עם Stockly.

## 🎯 5 שלבים להתחלה

### 1️⃣ התקנת תלויות

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2️⃣ יצירת קבצי .env

**`backend/.env`:**
```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**`frontend/.env`:**
```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

> 📍 **איפה למצוא את ה-Keys?**  
> Supabase Dashboard → Settings → API

### 3️⃣ הגדרת מסד נתונים

1. פתח **Supabase Dashboard** → **SQL Editor**
2. הפעל את ה-extension הנדרש:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
3. הרץ את המיגרציות בסדר (לפי המספרים):
   - התחל מ-`supabase/migrations/0001_schema.sql`
   - המשך לפי הסדר: 0002, 0003, 0004... עד 0021
   - ראה [supabase/README.md](../../supabase/README.md) לפרטים מלאים

### 4️⃣ הפעלת השרתים

**Terminal 1:**
```bash
cd backend
npm run dev
```

**Terminal 2:**
```bash
cd frontend
npm run dev
```

### 5️⃣ התחברות

1. פתח http://localhost:5173
2. לחץ על "הרשמה"
3. צור חשבון חדש
4. התחבר והתחל לעבוד! 🎉

---

## ✅ בדיקה שהכל עובד

1. **Backend:** פתח http://localhost:3001/health - צריך לראות `{"status":"ok"}`
2. **Frontend:** פתח http://localhost:5173 - צריך לראות דף התחברות
3. **Database:** הירשם והתחבר - אם זה עובד, הכל תקין!

---

## 🆘 בעיות נפוצות

| בעיה | פתרון |
|------|-------|
| `SUPABASE_URL is required` | ודא שקובץ `.env` קיים ונכון |
| CORS error | ודא ש-`FRONTEND_URL` תואם ל-URL של ה-frontend |
| RLS error | הרץ `update_policies_RLS.sql` ב-Supabase |
| Frontend לא מתחבר | ודא שה-backend רץ על פורט 3001 |

---

## 📖 מידע נוסף

למדריך מפורט, ראה [README.md](./README.md)
