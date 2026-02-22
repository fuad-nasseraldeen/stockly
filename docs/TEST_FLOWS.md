# Test Flows (Current)

מסמך זה מרכז את הזרימות הקריטיות לבדיקה לפי המצב הנוכחי בקוד.

## Core Areas

1. Auth + Tenant
2. Products CRUD + price history
3. Settings recalculation
4. Import/Export (highest volatility)
5. Admin

## Settings Precision Flow

### SF-01 Global decimal precision

- פעולה: שינוי `decimal_precision` במסך Settings (למשל 2 -> 4).
- ציפיה: ערכי מחיר חדשים נשמרים/מחושבים בדיוק החדש בכל המערכת.
- תצוגה: ספרות עודפות ואפסים לא משמעותיים בסוף נחתכים בתצוגה בלבד.
- אימות: מוצרים, היסטוריית מחירים, ייצוא PDF/CSV מציגים פורמט עקבי.

## Import Flows (Updated)

### IF-01 Preview Excel Multi-Sheet

- קלט: קובץ Excel עם יותר מגיליון אחד
- ציפיה: `sheetIndex=-1` מאחד את כל הגיליונות
- בדיקה: שורת header אחת, שורות מגיליונות נוספים מצורפות

### IF-02 Preview Paging

- קלט: קובץ עם >50 שורות
- ציפיה: preview מציג 50 לעמוד, כפתורי קודם/הבא עובדים
- בדיקה: מעבר דף לא מאפס mapping/manual columns

### IF-03 Global Apply Values

- פעולה: Apply to all rows בעמודה ידנית (category/package_type/pricing_unit)
- ציפיה: הערך חל על כל הקובץ, לא רק על הדף הנוכחי
- מימוש: payload כולל `manualGlobalValues`

### IF-04 Supplier Precedence

- קלט: יש supplier mapped column וגם supplier fallback עליון
- ציפיה: supplier מהקובץ קודם, fallback רק כשחסר

### IF-05 Supplier-only Continuation Row (Excel)

- קלט: שורה עם ספק בלבד מתחת לשורת מוצר
- ציפיה: הספק משויך למוצר הקודם, לא נוצרת שורת מוצר חדשה

### IF-06 Validate + Apply With Ignored Rows

- קלט: hidden/ignored rows
- ציפיה: סינון ignored נעשה אחרי normalize; אינדקסים נשארים יציבים

## Existing Automated Coverage

- Backend unit:
  - `tests/unit/lib/pricing.test.ts`
  - `tests/unit/lib/normalize.test.ts`
  - `tests/unit/routes/import.test.ts` (חדש: IF-01/03/04/05)
- Backend integration:
  - `tests/integration/middleware/auth.test.ts`
  - `tests/integration/routes/products.test.ts`
  - `tests/integration/routes/settings.test.ts`
- Frontend integration:
  - onboarding, hooks, pages (קבצים תחת `frontend/tests/integration`)
- Frontend unit:
  - `tests/unit/lib/number-format.test.ts`

## Manual Regression Checklist

- Import PDF + Excel
- Add/Edit price with `package_type` + `pricing_unit`
- Product list cards show package metadata
- Price history dialog loads supplier names
