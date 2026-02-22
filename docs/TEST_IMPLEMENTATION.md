# Test Implementation Status

## Automated tests in repo

### Backend

- `tests/unit/lib/pricing.test.ts`
- `tests/unit/lib/normalize.test.ts`
- `tests/unit/routes/import.test.ts` (חדש)
- `tests/integration/middleware/auth.test.ts`
- `tests/integration/routes/products.test.ts`
- `tests/integration/routes/settings.test.ts`

### Frontend

- `tests/integration/components/OnboardingRouter.test.tsx`
- `tests/integration/components/SplashAndAppFlow.test.tsx`
- `tests/integration/hooks/useProducts.test.tsx`
- `tests/integration/pages/*.test.tsx`
- `tests/unit/lib/pricing.test.ts`

## מה נוסף בסבב הזה

- טסט יחידה חדש ל-Import backend:
  - supplier precedence
  - manual global values
  - supplier-only continuation row (excel)
  - `parseSheetIndex(-1)` support

## Run commands

```bash
cd backend && npm run test
cd frontend && npm run test
```

## Recommended next coverage

1. Backend integration for `/api/import/preview|validate-mapping|apply` with multipart fixtures
2. Frontend integration test for ImportExport pagination + apply-to-all cross-page
3. End-to-end smoke (upload excel multi-sheet + apply)
