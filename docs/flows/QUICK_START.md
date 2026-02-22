# Quick Start

## 1) Install

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 2) Env

הגדר `backend/.env` ו-`frontend/.env` (ראה README ראשי).

אם עובדים עם PDF import:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- IAM permission: `textract:AnalyzeDocument`

## 3) DB Migrations

הרץ את כל `supabase/migrations/*.sql` לפי סדר מספרי עד `0028`.

## 4) Run

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

## 5) Smoke Test

1. העלה קובץ Excel עם כמה גיליונות -> ודא שכל הגיליונות נכנסים ל-preview.
2. עבור בין עמודי preview -> ודא שמיפוי לא מתאפס.
3. `Apply to all rows` לקטגוריה/סוג אריזה -> ודא שזה חל על כל הקובץ.
4. Validate + Apply -> ודא תוצאה בסוף הייבוא.
