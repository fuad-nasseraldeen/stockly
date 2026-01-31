# פלווים עיקריים בקומפוננטות (Component Flows)

## סקירה כללית
מסמך זה מתאר את הפלווים העיקריים בקומפוננטות השונות באפליקציה.

---

## 1. Products Page - ניהול מוצרים

**מיקום:** `frontend/src/pages/Products.tsx`

### 1.1 זרימת טעינה

```
Component Mount
    ↓
useProducts hook (with filters)
    ↓
React Query fetches from API
    ↓
Display loading state
    ↓
Receive data: {products, total, page, totalPages}
    ↓
Render products list
```

### 1.2 זרימת חיפוש

```
User types in search input
    ↓
useDebounce (350ms delay)
    ↓
Update search state
    ↓
Reset page to 1
    ↓
useProducts hook refetches
    ↓
API call with new search param
    ↓
Display filtered results
```

### 1.3 זרימת סינון

```
User selects supplier/category filter
    ↓
Update filter state
    ↓
Reset page to 1
    ↓
useProducts hook refetches
    ↓
API call with filter params
    ↓
Display filtered results
```

### 1.4 זרימת מיון

```
User selects sort option
    ↓
Update sort state
    ↓
Reset page to 1
    ↓
useProducts hook refetches
    ↓
API call with sort param
    ↓
Backend sorts before pagination
    ↓
Display sorted results
```

### 1.5 זרימת Pagination

```
User clicks "Next" or "Previous"
    ↓
Update page state
    ↓
useProducts hook refetches
    ↓
API call with new page param
    ↓
Display new page of results
```

### 1.6 זרימת מחיקת מוצר

```
User clicks "Delete" button
    ↓
Open delete confirmation dialog
    ↓
User confirms deletion
    ↓
useDeleteProduct.mutateAsync(productId)
    ↓
API DELETE /api/products/:id
    ↓
React Query invalidates ['products']
    ↓
useProducts hook refetches automatically
    ↓
Product removed from list
```

### 1.7 זרימת הוספת מחיר

```
User clicks "Add Price" (in EditProduct)
    ↓
Open price form dialog
    ↓
User fills: supplier, cost_price, margin_percent
    ↓
useAddProductPrice.mutateAsync()
    ↓
API POST /api/products/:id/prices
    ↓
Backend calculates sell_price
    ↓
React Query invalidates ['products', 'product']
    ↓
Product data refreshes
    ↓
New price appears in list
```

---

## 2. NewProduct Page - יצירת מוצר חדש

**מיקום:** `frontend/src/pages/NewProduct.tsx`

### 2.1 זרימת יצירה

```
User navigates to /products/new
    ↓
Form loads with empty fields
    ↓
User fills: name, category, unit
    ↓
User clicks "Create"
    ↓
useCreateProduct.mutateAsync(data)
    ↓
API POST /api/products
    ↓
Backend creates product
    ↓
React Query invalidates ['products']
    ↓
Navigate to /products/:id/edit
```

### 2.2 ולידציה

```
User submits form
    ↓
Frontend validation (required fields)
    ↓
If invalid → show errors
    ↓
If valid → send to API
    ↓
Backend validation (Zod schema)
    ↓
If invalid → return 400 error
    ↓
If valid → create product
```

---

## 3. EditProduct Page - עריכת מוצר

**מיקום:** `frontend/src/pages/EditProduct.tsx`

### 3.1 זרימת טעינה

```
User navigates to /products/:id/edit
    ↓
useProduct(id) hook fetches
    ↓
Display loading state
    ↓
Receive product data
    ↓
Populate form fields
    ↓
Display product details + prices
```

### 3.2 זרימת עדכון

```
User edits product name/category/unit
    ↓
User clicks "Save"
    ↓
useUpdateProduct.mutateAsync({id, data})
    ↓
API PUT /api/products/:id
    ↓
Backend updates product
    ↓
React Query invalidates ['products', 'product']
    ↓
Form data refreshes
    ↓
Show success message
```

---

## 4. Categories Page - ניהול קטגוריות

**מיקום:** `frontend/src/pages/Categories.tsx`

### 4.1 זרימת טעינה

```
Component Mount
    ↓
useCategories hook fetches
    ↓
Display categories list
```

### 4.2 זרימת יצירה

```
User clicks "Add Category"
    ↓
Open dialog with form
    ↓
User enters category name
    ↓
useCreateCategory.mutateAsync(name)
    ↓
API POST /api/categories
    ↓
React Query invalidates ['categories']
    ↓
New category appears in list
```

### 4.3 זרימת מחיקה

```
User clicks "Delete" on category
    ↓
Confirm deletion
    ↓
useDeleteCategory.mutateAsync(id)
    ↓
API DELETE /api/categories/:id
    ↓
React Query invalidates ['categories', 'products']
    ↓
Category removed from list
```

---

## 5. Suppliers Page - ניהול ספקים

**מיקום:** `frontend/src/pages/Suppliers.tsx`

### 5.1 זרימת יצירה

```
User clicks "Add Supplier"
    ↓
Open dialog with form
    ↓
User enters supplier name
    ↓
useCreateSupplier.mutateAsync(name)
    ↓
API POST /api/suppliers
    ↓
React Query invalidates ['suppliers']
    ↓
New supplier appears in list
```

### 5.2 זרימת עריכה

```
User clicks "Edit" on supplier
    ↓
Open dialog with current name
    ↓
User edits name
    ↓
useUpdateSupplier.mutateAsync({id, name})
    ↓
API PUT /api/suppliers/:id
    ↓
React Query invalidates ['suppliers']
    ↓
Supplier name updates
```

---

## 6. Settings Page - הגדרות

**מיקום:** `frontend/src/pages/Settings.tsx`

### 6.1 זרימת טעינה

```
Component Mount
    ↓
useSettings hook fetches
    ↓
Display current settings
```

### 6.2 זרימת עדכון

```
User changes VAT % or Margin %
    ↓
User clicks "Save"
    ↓
useUpdateSettings.mutateAsync(data)
    ↓
API PUT /api/settings
    ↓
Backend updates settings
    ↓
React Query invalidates ['settings']
    ↓
Settings refresh
    ↓
All product prices recalculate (on next view)
```

---

## 7. ImportExport Page - ייבוא/ייצוא

**מיקום:** `frontend/src/pages/ImportExport.tsx`

### 7.1 זרימת ייצוא

```
User clicks "Export Products"
    ↓
API GET /api/export
    ↓
Backend generates CSV/Excel
    ↓
Download file to user's computer
```

### 7.2 זרימת ייבוא

```
User selects file
    ↓
Parse file (CSV/Excel)
    ↓
Validate data
    ↓
Show preview
    ↓
User confirms import
    ↓
API POST /api/import
    ↓
Backend processes rows
    ↓
Show import results
    ↓
React Query invalidates ['products']
    ↓
Products list refreshes
```

---

## 8. Admin Page - ניהול מערכת

**מיקום:** `frontend/src/pages/Admin.tsx`

### 8.1 זרימת טעינה

```
Super admin navigates to /admin
    ↓
OnboardingRouter allows access (no tenant needed)
    ↓
useSuperAdmin hook verifies access
    ↓
Load tenants list
    ↓
Load users list
    ↓
Load audit logs
```

### 8.2 זרימת ניהול משתמשים

```
Admin views user list
    ↓
Admin clicks "Block User"
    ↓
API POST /api/admin/users/:id/block
    ↓
User is blocked in all tenants
    ↓
User cannot access system
```

### 8.3 זרימת ניהול טננטים

```
Admin views tenant list
    ↓
Admin clicks "View Tenant"
    ↓
Show tenant details + members
    ↓
Admin can block/unblock members
```

---

## 9. Navigation Component - ניווט

**מיקום:** `frontend/src/App.tsx`

### 9.1 זרימת ניווט

```
User clicks navigation link
    ↓
React Router navigates
    ↓
Component unmounts/remounts
    ↓
New page loads
    ↓
React Query fetches data if needed
```

### 9.2 זרימת Mobile Menu

```
User clicks hamburger menu (mobile)
    ↓
Dialog opens with menu items
    ↓
User clicks menu item
    ↓
Navigate to route
    ↓
Close dialog
```

---

## 10. TenantSwitcher - החלפת טננט

**מיקום:** `frontend/src/components/TenantSwitcher.tsx`

### 10.1 זרימת החלפה

```
User selects different tenant from dropdown
    ↓
setCurrentTenant(newTenant)
    ↓
Update localStorage: currentTenantId
    ↓
All API requests now use new tenant ID
    ↓
Optionally: window.location.reload()
    ↓
Or: queryClient.invalidateQueries()
    ↓
All data refreshes for new tenant
```

---

## 11. OnboardingRouter - בדיקת גישה

**מיקום:** `frontend/src/components/OnboardingRouter.tsx`

### 11.1 זרימת בדיקה

```
User logs in
    ↓
OnboardingRouter mounts
    ↓
Check if user has tenants
    ↓
If yes → show main app
    ↓
If no → show choice screen
    ↓
User chooses: create tenant / wait for invite
```

### 11.2 זרימת קבלת הזמנות

```
OnboardingRouter checks for invites
    ↓
API POST /api/invites/accept
    ↓
Backend creates membership
    ↓
Refetch tenants
    ↓
Tenant appears in list
    ↓
Auto-select tenant
    ↓
Show main app
```

---

## 12. React Query Patterns

### 12.1 Query (קריאה)

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['products', params],
  queryFn: () => productsApi.list(params),
});
```

**תפקיד:**
- טוען נתונים
- מנהל cache
- Refetch אוטומטי

### 12.2 Mutation (שינוי)

```typescript
const mutation = useMutation({
  mutationFn: productsApi.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  },
});
```

**תפקיד:**
- מבצע שינוי (create/update/delete)
- אחרי הצלחה → invalidate queries
- Refetch אוטומטי

### 12.3 Invalidation

```typescript
queryClient.invalidateQueries({ queryKey: ['products'] });
```

**תפקיד:**
- מסמן queries כלא-תקינים
- גורם ל-refetch אוטומטי
- מעדכן את ה-UI

---

## 13. Error Handling

### 13.1 Frontend Errors

```
API call fails
    ↓
apiRequest catches error
    ↓
If 401 → try refresh token
    ↓
If refresh fails → redirect to login
    ↓
If other error → show error message
    ↓
React Query handles retry logic
```

### 13.2 Backend Errors

```
Request arrives
    ↓
Middleware validates (auth, tenant)
    ↓
If invalid → return 401/403
    ↓
Route handler processes
    ↓
If error → return 400/500
    ↓
Frontend receives error
    ↓
Display to user
```

---

## 14. Loading States

### 14.1 Query Loading

```typescript
const { data, isLoading } = useQuery(...);

if (isLoading) {
  return <LoadingSpinner />;
}
```

### 14.2 Mutation Loading

```typescript
const mutation = useMutation(...);

<Button disabled={mutation.isPending}>
  {mutation.isPending ? 'שומר...' : 'שמור'}
</Button>
```

---

## סיכום - דפוסים עיקריים

1. **טעינה:** `useQuery` → `isLoading` → Display data
2. **שינוי:** `useMutation` → `invalidateQueries` → Refetch
3. **נווט:** React Router → Component mount → Fetch data
4. **חיפוש:** Debounce → Update state → Refetch
5. **סינון:** Update state → Reset page → Refetch
6. **Pagination:** Update page → Refetch with new page
7. **יצירה:** Form → Mutation → Invalidate → Navigate
8. **עדכון:** Form → Mutation → Invalidate → Refresh
9. **מחיקה:** Confirm → Mutation → Invalidate → Remove from list
10. **שגיאות:** Try/catch → Show error → Retry if needed
