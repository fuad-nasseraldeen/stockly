# Stockly Frontend

## סטאק

- React + TypeScript + Vite
- React Query
- Radix UI Select (shadcn style)
- RTL Hebrew UI

## הרצה

```bash
npm install
npm run dev
```

## Build + Quality

```bash
npm run build
npm run lint
npm run test
```

## דגשים עדכניים

- `ImportExport.tsx` כולל:
  - זיהוי אוטומטי של סוג קובץ (`excel` / `pdf`)
  - אינדיקציית טעינה מדורגת ל-Preview/Validate/Apply
  - Preview בפאג'ינציה (50 שורות לעמוד)
  - דפדוף בין דפים בלי לאפס מיפויים קיימים
  - `Apply to all rows` ששולח ערכים גלובליים לכל הקובץ
  - תמיכה בבחירת "כל הטבלאות יחד" ב-PDF
- כל dropdown-ים במסכים המעודכנים משתמשים ב-`Select` של Radix.

## קבצים מרכזיים

- `src/pages/ImportExport.tsx`
- `src/pages/Products.tsx`
- `src/pages/NewProduct.tsx`
- `src/pages/EditProduct.tsx`
- `src/lib/api.ts`

## הערות חשובות לפיתוח

- ב-import preview אינדקסי שורות הם אינדקסי מקור, לא רק אינדקס דף.
- עריכה ידנית ברמת שורה גוברת על ערך גלובלי.
- ערך גלובלי נשלח ל-backend תחת `manualGlobalValues`.
