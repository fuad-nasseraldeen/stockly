# Component Flows (Updated)

## 1) Products

- `Products.tsx` משתמש ב-`useProducts`.
- Search + filters + sort מרעננים query עם React Query.
- `package_type` ו-`pricing_unit` מוצגים קבוע בכרטיס מוצר (לא דרך layout chooser).

## 2) New Product

- הטופס כולל שדות קומפקטיים גם במובייל.
- ברירות מחדל:
  - `unit=unit`
  - `package_type=unknown`
  - `package_quantity=1`
  - `discount_percent=0`

## 3) Edit Product

- הוספת/עריכת מחיר כוללת:
  - ספק
  - מחיר עלות
  - סוג אריזה
  - סוג יחידה
  - כמות באריזה
  - אחוז הנחה
- היסטוריית מחירים נטענת עם fallback schema-safe.

## 4) Settings

- נשארו שדות `vat_percent`, `global_margin_percent` ו-`decimal_precision`.
- `use_vat/use_margin` לא משמשים כ-toggle UI במסך.
- `decimal_precision` חל על שמירת/חישוב מחירים ב-backend וגם על תצוגה ב-frontend.
- בתצוגה אפסים לא משמעותיים בסוף המספר מוסתרים (`1.5000 -> 1.5`).

## 5) ImportExport (Critical Flow)

### 5.1 Preview

- API: `POST /api/import/preview`
- Detect source type אוטומטית (`excel`/`pdf`).
- Excel ברירת מחדל: `sheetIndex=-1` => איחוד כל הגיליונות.
- PDF תומך `tableIndex=-1` => איחוד כל הטבלאות.
- Preview page size: 50 שורות (paging).

### 5.2 Mapping + Manual Values

- Mapping כולל שדות בסיס + זוגות `supplier_N/price_N`.
- עמודות `_derived` מוסתרות כברירת מחדל.
- ידני ברמת שורה (`manualValuesByRow`) נשמר לפי אינדקס מקור.
- `Apply to all rows` שומר גם `manualGlobalValues` ונשלח ל-validate/apply.

### 5.3 Supplier Resolution Priority

קדימות ספק ב-normalize:

1. ערך ידני לשורה
2. ספק מהעמודה הממופה בקובץ
3. ספק עליון (fallback גלובלי)

### 5.4 Excel-specific continuation rule

- אם שורה מכילה רק ספק (ללא מוצר/מחיר/שדות אחרים),
  היא מעדכנת את ספק השורה הקודמת ולא נוצרת כשורת מוצר חדשה.

### 5.5 Validate / Apply

- API: `POST /api/import/validate-mapping`
- API: `POST /api/import/apply`
- ignored rows מסוננות אחרי normalize כדי לשמור אינדקסים יציבים.
- דיאגנוסטיקות החזרה כוללות נתוני dropped/dedupe/ignored.

## 6) Admin + Onboarding

- ללא שינוי מהותי בזרימה:
  - `OnboardingRouter` מנהל כניסה/invites/tenant state.
  - Admin מוגבל ל-super admin.
