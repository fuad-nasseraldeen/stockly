# 💾 Database Backup Setup Guide

מדריך להגדרת גיבוי אוטומטי של הדאטה בייס עם GitHub Actions ו-Google Drive.

---

## 📋 דרישות מוקדמות

1. **GitHub Repository** - הפרויקט צריך להיות ב-GitHub

2. **Google Drive Account** - חשבון Google Drive
3. **PostgreSQL Connection String** - מ-Supabase Dashboard

---

## 🔧 שלב 1: קבלת Connection String מ-Supabase

**⚠️ חשוב:** Supabase עלול לחסום IP addresses של GitHub Actions. יש כמה פתרונות:

### אפשרות 1: Connection Pooling (מומלץ לנסות קודם)

1. לך ל-[Supabase Dashboard](https://supabase.com/dashboard)
2. בחר את הפרויקט שלך
3. לך ל-**Project Settings** → **Database**
4. מצא את **Connection String** → בחר **Connection Pooling**
5. בחר **Session mode** (מומלץ)
6. העתק את ה-Connection String
   - זה נראה כך: `postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres`

### אפשרות 2: Direct Connection (אם Pooling לא עובד)

1. לך ל-**Project Settings** → **Database**
2. מצא את **Connection String** → **Direct connection**
3. העתק את ה-Connection String
   - זה נראה כך: `postgresql://postgres:password@db.xxx.supabase.co:5432/postgres`

**📝 הערה:** 
- ה-workflow ינסה Connection Pooling קודם (port 6543)
- אם זה לא עובד, ייתכן שצריך ליצור קשר עם Supabase Support כדי לאשר IP addresses של GitHub Actions
- חלופה: להשתמש ב-Supabase Dashboard → Database → Backups לייצוא ידני
---

## 🔧 שלב 2: הגדרת Google Drive API

### 2.1 יצירת Google Service Account

1. לך ל-[Google Cloud Console](https://console.cloud.google.com/)
2. צור פרויקט חדש (או בחר קיים)
3. לך ל-**APIs & Services** → **Library**
4. חפש **Google Drive API** והפעל אותו
5. לך ל-**APIs & Services** → **Credentials**
6. לחץ על **Create Credentials** → **Service Account**
7. תן שם ל-Service Account (למשל: `stockly-backup`)
8. לחץ על **Create and Continue**
9. דלג על ה-Optional steps (או הגדר לפי הצורך)
10. לחץ על **Done**

### 2.2 יצירת Key ל-Service Account

1. לחץ על ה-Service Account שיצרת
2. לך ל-**Keys** tab
3. לחץ על **Add Key** → **Create new key**
4. בחר **JSON** ולחץ **Create**
5. קובץ JSON יורד - שמור אותו (תצטרך אותו בהמשך)

### 2.3 יצירת תיקייה ב-Google Drive

1. לך ל-[Google Drive](https://drive.google.com/)
2. צור תיקייה חדשה (למשל: `Stockly Backups`)
3. לחץ ימני על התיקייה → **Share**
4. הוסף את ה-Service Account email (מהקובץ JSON שירד)
   - זה נראה כך: `stockly-backup@your-project.iam.gserviceaccount.com`
5. תן הרשאה **Editor**
6. לחץ **Send**
7. העתק את ה-Folder ID מה-URL:

folder Id = 1lVOiwILSg9nz2uDwFsnPqVh1UT0n8aPv
   ```
   https://drive.google.com/drive/folders/[FOLDER-ID]
   ```

---

## 🔧 שלב 3: הגדרת GitHub Secrets

1. לך ל-GitHub Repository שלך
2. לך ל-**Settings** → **Secrets and variables** → **Actions**
3. לחץ על **New repository secret**
4. הוסף את ה-Secrets הבאים:

### Secret 1: `SUPABASE_DATABASE_URL`
- **Name:** `SUPABASE_DATABASE_URL`
- **Value:** ה-Connection String מ-Supabase (משלב 1)
- **מומלץ:** Connection Pooling (port 6543)
- **Example:** `postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres`

### Secret 2: `GOOGLE_DRIVE_FOLDER_ID`
- **Name:** `GOOGLE_DRIVE_FOLDER_ID`
- **Value:** ה-Folder ID מ-Google Drive (משלב 2.3)
- **Example:** `1a2b3c4d5e6f7g8h9i0j`

### Secret 3: `GOOGLE_SERVICE_ACCOUNT`
- **Name:** `GOOGLE_SERVICE_ACCOUNT`
- **Value:** כל התוכן של קובץ ה-JSON שירד (משלב 2.2)
- **Format:** העתק את כל התוכן של הקובץ (כולל הסוגריים)

---

## 🔧 שלב 4: הפעלת ה-Backup

### אוטומטי:
- ה-Backup ירוץ אוטומטית **כל יום ב-2:00 UTC** (4:00 בבוקר שעון ישראל)
- לא צריך לעשות כלום!

### ידני:
1. לך ל-GitHub Repository → **Actions** tab
2. בחר **Database Backup** workflow
3. לחץ על **Run workflow**
4. בחר branch (בדרך כלל `main`)
5. לחץ **Run workflow**

---

## 📥 שחזור גיבוי

### מהורדה מ-GitHub:
1. לך ל-GitHub Repository → **Actions**
2. בחר את ה-run האחרון של **Database Backup**
3. גלול למטה ל-**Artifacts**
4. הורד את `database-backup`
5. חלץ את הקובץ (`.sql.gz`)
6. שחזר:
   ```bash
   gunzip backup_YYYYMMDD_HHMMSS.sql.gz
   psql "postgresql://..." < backup_YYYYMMDD_HHMMSS.sql
   ```

### מ-Google Drive:
1. לך ל-Google Drive → התיקייה שיצרת
2. הורד את הקובץ הרצוי
3. שחזר כמו למעלה

---

## 🔍 בדיקת הגיבוי

### בדיקה ידנית:
```bash
# הרץ את ה-script מקומית
cd scripts
chmod +x backup.sh  # Linux/Mac
./backup.sh         # Linux/Mac
# או
.\backup.ps1        # Windows PowerShell
```

### בדיקה ב-GitHub Actions:
1. לך ל-**Actions** tab
2. בדוק את ה-run האחרון
3. אם יש שגיאות, תראה אותן שם

---

## ⚙️ התאמה אישית

### שינוי תדירות הגיבוי:
ערוך את `.github/workflows/backup.yml`:
```yaml
schedule:
  - cron: '0 2 * * *'  # כל יום ב-2:00 UTC
  # אפשרויות:
  # '0 2 * * 0'  # כל שבוע (יום ראשון)
  # '0 2 1 * *'  # כל חודש (יום 1)
```

### שינוי מספר הימים לשמירה:
ערוך את `.github/workflows/backup.yml`:
```yaml
# Cleanup old backups (keep last 30 days)
find backups/ -name "backup_*.sql.gz" -mtime +30 -delete
# שנה את +30 למספר הימים הרצוי
```

---

## 🐛 פתרון בעיות

### שגיאת "pg_dump: command not found"
**פתרון:** GitHub Actions מתקין את זה אוטומטית. אם זה לא עובד, בדוק את ה-workflow.

### שגיאת "Network is unreachable" או "connection failed"
**פתרון:**
1. ודא שאתה משתמש ב-**Connection Pooling** (port 6543)
2. נסה להשתמש ב-Direct connection (port 5432) - לפעמים זה עובד
3. **אם כלום לא עובד:** Supabase חוסם את ה-IP addresses של GitHub Actions
   - פתרון 1: צור קשר עם Supabase Support כדי לאשר IP addresses של GitHub Actions
   - פתרון 2: השתמש ב-Supabase Dashboard → Database → Backups לייצוא ידני
   - פתרון 3: הרץ את ה-backup מ-server עם IP מורשה

### שגיאת "DATABASE_URL not set"
**פתרון:** ודא שה-Secret `SUPABASE_DATABASE_URL` מוגדר ב-GitHub Secrets.

### שגיאת "Google Drive upload failed"
**פתרון:**
1. ודא שה-Service Account email נוסף לתיקייה ב-Google Drive
2. ודא שה-`GOOGLE_DRIVE_FOLDER_ID` נכון
3. ודא שה-`GOOGLE_SERVICE_ACCOUNT` JSON נכון (כל התוכן של הקובץ)
4. ודא שה-Google Drive API מופעל ב-Google Cloud Console
5. בדוק את ה-logs ב-GitHub Actions לפרטים נוספים

### הגיבוי לא רץ אוטומטית
**פתרון:**
1. ודא שיש commit ב-`main` branch (GitHub לא מריץ workflows על branches ריקים)
2. בדוק את ה-Actions tab - אולי יש שגיאות

---

## 📊 מעקב אחר גיבויים

### ב-GitHub:
- לך ל-**Actions** tab
- כל run של backup מופיע שם
- אפשר לראות את ה-artifacts (קבצי הגיבוי)

### ב-Google Drive:
- לך לתיקייה שיצרת
- כל גיבוי נשמר שם עם timestamp
- אפשר להוריד מכל מקום

---

## 🔒 אבטחה

### מה שמור ב-Secrets:
- ✅ `SUPABASE_DATABASE_URL` - Connection String (סודי!)
- ✅ `GOOGLE_DRIVE_FOLDER_ID` - Folder ID (לא סודי)
- ✅ `GOOGLE_SERVICE_ACCOUNT` - Service Account JSON (סודי!)

### המלצות:
- ❌ **אל תעלה את ה-Secrets ל-Git!**
- ✅ **שמור את ה-Secrets רק ב-GitHub Secrets**
- ✅ **אל תשתף את ה-Connection String עם אחרים**
- ✅ **שמור את קובץ ה-JSON במקום בטוח**

---

## 📝 הערות

- הגיבויים נשמרים ב-Google Drive **לצמיתות** (אלא אם תמחק ידנית)
- הגיבויים ב-GitHub Artifacts נשמרים **7 ימים** (אפשר לשנות)
- הגיבויים המקומיים (אם תריץ את ה-script) נשמרים **30 ימים** (אפשר לשנות)

---

## ✅ סיכום

אחרי ההגדרה:
1. ✅ הגיבוי רץ **אוטומטית כל יום**
2. ✅ נשמר ב-**Google Drive**
3. ✅ נשמר גם ב-**GitHub Artifacts** (7 ימים)
4. ✅ מנקה גיבויים ישנים **אוטומטית**
5. ✅ אפשר להריץ **ידנית** מתי שרוצים

**זה הכל!** 🎉
