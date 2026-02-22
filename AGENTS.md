                                                         NB H.M# AGENTS.md - Cursor Project Playbook

מסמך עבודה קבוע ל-Agent/Cursor כדי להתחיל לעבוד נכון בפרויקט הזה.

## 1) מאיפה להתחיל בכל סשן

1. לקרוא `README.md` (מצב פרויקט + פקודות בסיסיות).
2. לקרוא `docs/flows/04-component-flows.md` (התנהגות מסכים עדכנית).
3. אם יש שינוי DB/Import:
   - `supabase/README.md`
   - `backend/src/routes/import.ts`
   - `frontend/src/pages/ImportExport.tsx`
   - `frontend/src/lib/api.ts`
4. להריץ בדיקה מהירה של סטטוס:
   - `git status --short`
   - `npm run build` ב-backend וב-frontend
- אם שינוי נוגע למחירים: לבדוק גם `decimal_precision` ב-`settings` והשפעה על תצוגה/ייצוא.

## 2) פקודות יומיות

```bash
# backend
cd backend
npm run dev
npm run build
npm run test

# frontend
cd frontend
npm run dev
npm run build
npm run test
```

## 3) Debug checklist - Import

### Excel

- ברירת מחדל: `sheetIndex=-1` (כל הגיליונות יחד).
- Preview בפאג'ינציה של 50 שורות.
- Apply-to-all משתמש ב-`manualGlobalValues`.
- ספק: mapping row-level קודם ל-global fallback.
- שורת "ספק בלבד" (excel) משויכת לשורה הקודמת.

### PDF

- `tableIndex=-1` = כל הטבלאות יחד.
- Textract + fallback parser.
- בדוק נירמול טקסט עברי אם יש מילים צמודות.

## 4) בדיקות חובה אחרי שינוי Import

1. `npm run build` (backend + frontend)
2. `npm run test` (לפחות backend unit)
3. העלאת Excel עם כמה גיליונות
4. מעבר בין עמודי preview
5. Validate + Apply עם:
   - שורה ידנית
   - Apply-to-all גלובלי
   - ignored rows

## 5) כללי עבודה

- לא לשבור backward compatibility במיגרציות.
- שינויים ב-import מחייבים עדכון docs + tests.
- שינויי חישוב/פורמט מחירים חייבים להשתמש ב-helpers המשותפים:
  - backend: `backend/src/lib/pricing.ts`
  - frontend: `frontend/src/lib/number-format.ts`
- אם מתווסף field חדש למחיר:
  - לעדכן schema backend
  - לעדכן API frontend types
  - לעדכן views/migrations לפי צורך
  - לעדכן תיעוד.
