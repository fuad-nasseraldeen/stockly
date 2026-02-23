# Stockly

מערכת ניהול מלאי ומחירים עם תמיכה מלאה בעברית (RTL), Multi-tenant, ייבוא/ייצוא, והיסטוריית מחירים.

## מה חדש ומסונכרן (2026-02)

- ייבוא `PDF` עם Textract + fallback חכם + נירמול טקסט עברי.
- ייבוא `Excel` מכל הגיליונות יחד כברירת מחדל (`sheetIndex=-1`).
- Preview של ייבוא בפאג'ינציה (50 שורות לעמוד) במקום 50 ראשונות קבוע.
- `Apply to all rows` אמיתי: ערכים ידניים גלובליים (למשל `category`, `package_type`, `pricing_unit`) חלים על כל הקובץ.
- קדימות ספק בייבוא תוקנה: ספק מהקובץ קודם, ספק עליון רק כ-fallback.
- תאימות לאחור למחירים מורחבים גם אם חלק מהמיגרציות טרם הורצו.
- נוספה הגדרת טננט `decimal_precision` (ברירת מחדל 2) שחלה על שמירה וחישוב מחירים בכל המערכת.

## ארכיטקטורה

- `frontend/` React + Vite + TypeScript
- `backend/` Express + TypeScript
- `supabase/` מיגרציות SQL
- `docs/` תיעוד flows, setup, testing

## התקנה מהירה

```bash
git clone <repo>
cd stockly

cd backend && npm install
cd ../frontend && npm install
```

### משתני סביבה

`backend/.env`

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_JWT_AUDIENCE=authenticated
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
```

`frontend/.env`

```env
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```

## מסד נתונים

הרץ מיגרציות לפי סדר מספרי בתיקיית `supabase/migrations/`.

מיגרציות חדשות חשובות לייבוא:

- `0025_add_import_mappings_source_type.sql`
- `0026_add_safe_package_metadata_to_price_entries.sql`
- `0027_add_roll_to_package_type_enum.sql`
- `0028_refresh_current_price_view_with_package_metadata.sql`
- `0029_add_decimal_precision_setting_and_expand_price_scales.sql`

> לפני מיגרציות חיפוש יש לוודא `pg_trgm`:
>
> `CREATE EXTENSION IF NOT EXISTS pg_trgm;`

## הרצה מקומית

```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/health`

## בדיקות

```bash
# backend
cd backend
npm run test
npm run test:unit
npm run test:integration

# frontend
cd frontend
npm run test
npm run test:integration
```

## תיעוד מפורט

- `docs/flows/README.md`
- `docs/flows/04-component-flows.md`
- `docs/TEST_FLOWS.md`
- `docs/TEST_SUMMARY.md`
- `supabase/README.md`

## Cursor / Agent onboarding

נוסף קובץ `AGENTS.md` בשורש הפרויקט עם:

- מאיפה מתחילים לקרוא קוד
- פקודות יומיות לפיתוח/בדיקות
- צ'ק-ליסט לפני שינויי Import/DB
- סדר בדיקה מהיר אחרי שינויים
