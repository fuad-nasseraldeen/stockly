# Test Summary (Synced 2026-02)

## Current result

- תשתית הטסטים קיימת ופועלת (backend + frontend).
- נוסף כיסוי אוטומטי חדש ל-import logic ב-backend.
- מסמכי הטסטים עודכנו למצב הקוד הנוכחי.

## New import coverage added

- supplier column overrides global supplier fallback
- global manual values apply to all rows
- excel supplier-only row updates previous row supplier
- `sheetIndex=-1` merge-all-sheets selector

## Decimal precision coverage

- Backend: נוספו בדיקות ל-`roundToPrecision`, `clampDecimalPrecision`, ו-precision-aware sell/cost calculations.
- Frontend: נוספו בדיקות ל-`number-format` (fallback, rounding, trimming, precision 2/4).
- Settings integration: עדכון/קריאה של `decimal_precision` נבדקים יחד עם settings flow.

## Gaps still to close

- integration tests מלאים ל-import routes עם קבצי fixture אמיתיים
- UI test ל-ImportExport pagination across pages
- E2E happy path import regression

## Commands

```bash
cd backend && npm run test:unit
cd backend && npm run test:integration
cd frontend && npm run test
```
