# Flows Documentation

מסמכי ה-flow המסונכרנים לפרויקט.

## קבצים מרכזיים

- `01-products-flow.md` - טעינה/חיפוש/סינון/מיון מוצרים
- `02-authentication-flow.md` - התחברות, session, auth middleware
- `03-tenant-flow.md` - tenant context, invites, tenant switching
- `04-component-flows.md` - ה-flowים העדכניים במסכים כולל Import/Export

## מה עודכן בסבב הנוכחי

- זרימת ImportExport עודכנה למצב הנוכחי בקוד:
  - Excel multi-sheet merge כברירת מחדל
  - preview paging
  - manual global values לכל הקובץ
  - supplier fallback precedence מתוקן
  - supplier-only continuation rows (excel)

## איך להשתמש בתיעוד

1. להתחיל ב-`04-component-flows.md` כדי להבין התנהגות מסכים.
2. להצליב עם `docs/TEST_FLOWS.md` לפני כתיבת טסטים.
3. לשינויי DB להצליב עם `supabase/README.md`.
