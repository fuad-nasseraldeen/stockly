# זרימת קריאת מוצרים (Products Flow)

> עדכון 2026-02: הזרימה כאן עדיין תקפה עקרונית. לפרטי Import/Export עדכניים ראה `04-component-flows.md`.
> מספרי שורות בקוד במסמך זה הם אינדיקטיביים בלבד ועלולים להשתנות.

## סקירה כללית
מסמך זה מתאר את הזרימה המלאה של קריאת מוצרים מהפרונטאנד ועד הבקאנד, כולל חיפוש, סינון, מיון ופאגינציה.

---

## 1. Frontend - `Products.tsx` (שורה 34-41)

**מיקום:** `frontend/src/pages/Products.tsx`

```typescript
const { data: productsData, isLoading } = useProducts({
  search: debouncedSearch || undefined,
  supplier_id: supplierFilter || undefined,
  category_id: categoryFilter || undefined,
  sort,
  page,
  pageSize,
});
```

**תפקיד:**
- משתמש ב-hook `useProducts` עם הפרמטרים הבאים:
  - `search`: חיפוש (עם debounce של 350ms)
  - `supplier_id`: סינון לפי ספק
  - `category_id`: סינון לפי קטגוריה
  - `sort`: מיון (price_asc, price_desc, updated_desc, updated_asc)
  - `page`: מספר עמוד (default: 1)
  - `pageSize`: מספר מוצרים לעמוד (default: 10)

**תוצאה:**
- `productsData`: אובייקט עם `{products, total, page, totalPages}`
- `isLoading`: מצב טעינה

---

## 2. Frontend - `useProducts.ts` (שורה 12-15)

**מיקום:** `frontend/src/hooks/useProducts.ts`

```typescript
return useQuery({
  queryKey: ['products', params],
  queryFn: () => productsApi.list(params),
});
```

**תפקיד:**
- React Query hook שמנהל את הקריאה ל-API
- `queryKey`: מפתח ייחודי לזיהוי השאילתה (מאפשר caching)
- `queryFn`: פונקציה שקוראת ל-`productsApi.list`

**יתרונות:**
- Caching אוטומטי
- Refetching אוטומטי
- ניהול מצב טעינה ושגיאות

---

## 3. Frontend - `api.ts` - `productsApi.list` (שורה 258-266)

**מיקום:** `frontend/src/lib/api.ts`

```typescript
list: (params?): Promise<ProductsResponse> => {
  const queryParams = new URLSearchParams();
  if (params?.search) queryParams.append('search', params.search);
  if (params?.supplier_id) queryParams.append('supplier_id', params.supplier_id);
  if (params?.category_id) queryParams.append('category_id', params.category_id);
  if (params?.sort) queryParams.append('sort', params.sort);
  if (params?.page) queryParams.append('page', String(params.page));
  if (params?.pageSize) queryParams.append('pageSize', String(params.pageSize));
  return apiRequest<ProductsResponse>(`/api/products?${queryParams.toString()}`);
}
```

**תפקיד:**
- בונה query string מהפרמטרים
- קורא ל-`apiRequest` עם ה-URL המלא

**דוגמה ל-URL:**
```
/api/products?search=חלב&supplier_id=123&sort=price_asc&page=1&pageSize=10
```

---

## 4. Frontend - `api.ts` - `apiRequest` (שורה 115-154)

**מיקום:** `frontend/src/lib/api.ts`

```typescript
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit & { skipTenantHeader?: boolean }
): Promise<T> {
  const token = await getAuthToken();
  const tenantId = options?.skipTenantHeader ? undefined : getTenantId();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (tenantId && !options?.skipTenantHeader) {
    headers['x-tenant-id'] = tenantId;
  }

  const url = API_URL ? `${API_URL}${endpoint}` : endpoint;
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });
  
  // ... error handling ...
  
  return response.json();
}
```

**תפקיד:**
- מבצע `fetch` ל-API עם headers:
  - `Authorization: Bearer <token>` - אימות משתמש
  - `x-tenant-id: <tenantId>` - זיהוי טננט
  - `Content-Type: application/json`
- מטפל בשגיאות (401, refresh token, וכו')
- מחזיר את התשובה כ-JSON

**הערות:**
- `API_URL` נקבע לפי סביבה (localhost:3001 בפיתוח, Vercel URL ב-production)
- אם token פג תוקף, מנסה לרענן אותו אוטומטית

---

## 5. Backend - `routes/products.ts` - GET `/api/products` (שורה 105)

**מיקום:** `backend/src/routes/products.ts`

```typescript
router.get('/', requireAuth, requireTenant, async (req, res) => {
  // 1. קורא פרמטרים מה-query
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;
  const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : undefined;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updated_desc';
  const page = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '10', 10)));
  const offset = (page - 1) * pageSize;

  // 2. בודק cache לחיפוש
  const cacheKey = getCacheKey(tenant.tenantId, search, supplierId, categoryId, sort);
  let productIds: string[] | null = getCachedProductIds(cacheKey);

  // 3. אם אין cache, מבצע חיפוש
  if (productIds === null) {
    // חיפוש עם ILIKE (2 תווים או פחות) או fuzzy search (3+ תווים)
    // ... לוגיקת חיפוש ...
    setCachedProductIds(cacheKey, productIds);
  }

  // 4. סינון לפי ספק וקטגוריה
  // 5. מיון (לפני pagination!)
  // 6. Pagination
  // 7. שליפת פרטי מוצרים מלאים

  return res.json({
    products: paginatedResult,
    total: totalCount,
    page,
    totalPages,
  });
});
```

**תפקיד:**
1. **קריאת פרמטרים** מה-query string
2. **בדיקת cache** - אם יש תוצאות במטמון (5 דקות TTL), משתמש בהן
3. **חיפוש:**
   - עד 2 תווים: `ILIKE` (חיפוש רגיל)
   - 3+ תווים: `pg_trgm` (fuzzy search - מטפל בטעויות כתיב)
4. **סינון** לפי ספק וקטגוריה
5. **מיון** - לפי מחיר או תאריך עדכון (לפני pagination!)
6. **Pagination** - חישוב offset ו-limit
7. **שליפת פרטים** - מוצרים עם מחירים, קטגוריות, ספקים
8. **החזרת תשובה** בפורמט `{products, total, page, totalPages}`

**Middleware:**
- `requireAuth`: בודק שהמשתמש מחובר (token תקין)
- `requireTenant`: בודק שהמשתמש שייך לטננט (x-tenant-id header)

---

## 6. Backend - Database Queries

### 6.1 חיפוש מוצרים
```sql
-- עד 2 תווים: ILIKE
SELECT id FROM products 
WHERE tenant_id = $1 
AND name ILIKE $2

-- 3+ תווים: Fuzzy search
SELECT id FROM products 
WHERE tenant_id = $1 
AND similarity(name, $2) > 0.3
ORDER BY similarity(name, $2) DESC
```

### 6.2 שליפת מוצרים עם פרטים
```sql
SELECT 
  p.*,
  c.name as category_name,
  -- מחירים, סיכומים, וכו'
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.id = ANY($1::uuid[])
ORDER BY ...
LIMIT $2 OFFSET $3
```

---

## 7. תשובה לפרונטאנד

**פורמט התשובה:**
```typescript
{
  products: Product[],
  total: number,        // סה"כ מוצרים (לפני pagination)
  page: number,         // עמוד נוכחי
  totalPages: number    // סה"כ עמודים
}
```

**דוגמה:**
```json
{
  "products": [
    {
      "id": "123",
      "name": "חלב 1 ליטר",
      "category": { "id": "456", "name": "מוצרי חלב" },
      "prices": [...],
      "summary": {
        "min_current_cost_price": 5.50,
        "last_price_update_at": "2024-01-15T10:30:00Z"
      }
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 15
}
```

---

## 8. הצגה ב-UI

**מיקום:** `frontend/src/pages/Products.tsx`

```typescript
const products = productsData?.products || [];
const totalProducts = productsData?.total || 0;
const totalPages = productsData?.totalPages || 0;
const currentPage = productsData?.page || 1;

// הצגת מוצרים
{products.map((product) => (
  <Card key={product.id}>
    {/* פרטי מוצר */}
  </Card>
))}

// Pagination controls
<Button onClick={() => setPage(p => p - 1)} disabled={currentPage === 1}>
  קודם
</Button>
<span>עמוד {currentPage} מתוך {totalPages}</span>
<Button onClick={() => setPage(p => p + 1)} disabled={currentPage === totalPages}>
  הבא
</Button>
```

---

## סיכום הזרימה

```
User Input (Products.tsx)
    ↓
useProducts Hook (React Query)
    ↓
productsApi.list (builds query string)
    ↓
apiRequest (adds auth headers)
    ↓
fetch → Backend API
    ↓
requireAuth + requireTenant (middleware)
    ↓
GET /api/products (routes/products.ts)
    ↓
Search + Filter + Sort + Paginate
    ↓
Database Queries (Supabase)
    ↓
Response: {products, total, page, totalPages}
    ↓
React Query Cache
    ↓
UI Update (Products.tsx)
```

---

## תכונות מיוחדות

### 1. Search Cache
- Cache בזיכרון (5 דקות TTL)
- מפתח: `${tenantId}:${search}:${supplierId}:${categoryId}:${sort}`
- חוסך חיפושים חוזרים

### 2. Fuzzy Search
- 3+ תווים: `pg_trgm` similarity search
- מטפל בטעויות כתיב
- מיון לפי דמיון

### 3. Server-Side Sorting
- מיון לפני pagination (לא ב-Node.js!)
- מיון לפי מחיר או תאריך עדכון

### 4. Debounced Search
- 350ms debounce בפרונטאנד
- מפחית קריאות מיותרות ל-API
