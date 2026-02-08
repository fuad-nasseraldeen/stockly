# Test Flows - Complete Flow List

This document lists ALL user flows extracted from code and documentation for test coverage.

## A) FLOW LIST

### Authentication & Session Flows

**F001: User Login**
- Entry: `/login` page
- API: `supabase.auth.signInWithPassword()`
- Auth: None (public)
- Success: Navigate to `/products`, session created
- Failure: Invalid credentials, network error
- Edge: Expired session, refresh token

**F002: User Signup**
- Entry: `/signup` page
- API: `supabase.auth.signUp()`
- Auth: None (public)
- Success: Account created, navigate to `/login`
- Failure: Email exists, weak password, network error

**F003: Session Check & Auto-Login**
- Entry: App mount (`App.tsx`)
- API: `supabase.auth.getSession()`, `onAuthStateChange()`
- Auth: None (checks existing session)
- Success: Auto-login if valid session exists
- Failure: No session, expired token
- Edge: Token refresh during session

**F004: Logout**
- Entry: Logout button
- API: `supabase.auth.signOut()`
- Auth: Authenticated user
- Success: Session cleared, redirect to `/login`
- Failure: Network error

**F005: Token Refresh on 401**
- Entry: API request returns 401
- API: `supabase.auth.refreshSession()`, retry request
- Auth: Authenticated user with expired token
- Success: Token refreshed, request retried successfully
- Failure: Refresh fails → redirect to login

### Tenant & Onboarding Flows

**F006: Onboarding - New User (No Tenants)**
- Entry: User logs in, `OnboardingRouter` checks tenants
- API: `GET /api/tenants`, `POST /api/invites/accept`
- Auth: Authenticated user
- Success: Show choice screen (`/onboarding`)
- Failure: API error, network failure
- Edge: Pending invites exist → auto-accept

**F007: Onboarding - Create New Tenant**
- Entry: `/create-tenant` page
- API: `POST /api/tenants`
- Auth: Authenticated user
- Role: Any authenticated user
- Success: Tenant created, user becomes owner, navigate to `/products`
- Failure: Validation error, duplicate name, network error

**F008: Onboarding - Existing User (Has Tenants)**
- Entry: User logs in with existing tenants
- API: `GET /api/tenants`
- Auth: Authenticated user
- Success: Load tenant from localStorage or first tenant, show main app
- Failure: API error, tenant deleted

**F009: Tenant Switcher - Change Tenant**
- Entry: TenantSwitcher dropdown
- API: None (localStorage update)
- Auth: Authenticated user with multiple tenants
- Success: `currentTenantId` updated in localStorage, all API requests use new tenant
- Failure: Invalid tenant ID, tenant access revoked
- Edge: Tenant blocked → show error

**F010: Invite Acceptance (Auto)**
- Entry: `OnboardingRouter` on mount with invite token in URL
- API: `POST /api/invites/accept`
- Auth: Authenticated user
- Success: Invites accepted, memberships created, tenants refetched
- Failure: No invites, invite expired, network error

**F011: Invite Acceptance (Manual)**
- Entry: `/no-access` page "Check again" button
- API: `POST /api/invites/accept`
- Auth: Authenticated user
- Success: Pending invites accepted, tenant appears
- Failure: No invites, network error

**F012: Super Admin Access (No Tenant Required)**
- Entry: `/admin` page
- API: `GET /api/admin/check`
- Auth: Authenticated user with `is_super_admin = true`
- Success: Access admin panel without tenant
- Failure: Not super admin → 403

### Product Management Flows

**F013: List Products (With Filters)**
- Entry: `/products` page
- API: `GET /api/products?search=&supplier_id=&category_id=&sort=&page=&pageSize=`
- Auth: Authenticated user + tenant
- Success: Products list with pagination
- Failure: No tenant, API error, network timeout
- Edge: Empty results, large dataset pagination

**F014: Search Products (Debounced)**
- Entry: Search input in Products page
- API: `GET /api/products?search=<query>`
- Auth: Authenticated user + tenant
- Success: Filtered products displayed (350ms debounce)
- Failure: Invalid search, API error
- Edge: Short search (2 chars) → ILIKE, Long search (3+) → fuzzy search

**F015: Filter Products by Supplier**
- Entry: Supplier filter dropdown
- API: `GET /api/products?supplier_id=<id>`
- Auth: Authenticated user + tenant
- Success: Products filtered by supplier
- Failure: Invalid supplier ID, supplier deleted

**F016: Filter Products by Category**
- Entry: Category filter dropdown
- API: `GET /api/products?category_id=<id>`
- Auth: Authenticated user + tenant
- Success: Products filtered by category
- Failure: Invalid category ID

**F017: Sort Products**
- Entry: Sort dropdown (price_asc, price_desc, updated_desc, updated_asc)
- API: `GET /api/products?sort=<option>`
- Auth: Authenticated user + tenant
- Success: Products sorted correctly
- Failure: Invalid sort option

**F018: Pagination**
- Entry: Next/Previous page buttons
- API: `GET /api/products?page=<n>&pageSize=10`
- Auth: Authenticated user + tenant
- Success: Next/previous page loaded
- Failure: Invalid page number, out of bounds

**F019: Create Product**
- Entry: `/products/new` page
- API: `POST /api/products` (with initial price)
- Auth: Authenticated user + tenant
- Success: Product created with price, navigate to edit page
- Failure: Validation error (missing name), duplicate product, network error
- Edge: Product with SKU, package_quantity

**F020: Edit Product**
- Entry: `/products/:id/edit` page
- API: `GET /api/products/:id`, `PUT /api/products/:id`
- Auth: Authenticated user + tenant
- Success: Product updated
- Failure: Product not found, validation error, network error

**F021: Delete Product (Soft Delete)**
- Entry: Delete button in Products list
- API: `DELETE /api/products/:id`
- Auth: Authenticated user + tenant
- Success: Product marked as `is_active = false`, removed from list
- Failure: Product not found, network error
- Edge: Product with prices → soft delete only

**F022: Add Price to Product**
- Entry: "Add Price" button in EditProduct page
- API: `POST /api/products/:id/prices`
- Auth: Authenticated user + tenant
- Success: New price entry created, product prices updated
- Failure: Invalid supplier, validation error, network error
- Edge: Price with discount, package_quantity

**F023: View Price History**
- Entry: "History" button in Products/EditProduct
- API: `GET /api/products/:id/price-history?supplier_id=`
- Auth: Authenticated user + tenant
- Success: Price history displayed in dialog
- Failure: Product not found, no history

**F024: Export Products (CSV)**
- Entry: "Export CSV" button in Products page
- API: `GET /api/export/current.csv`
- Auth: Authenticated user + tenant
- Success: CSV file downloaded
- Failure: Network error, no products

**F025: Export Products (PDF)**
- Entry: "Export PDF" button in Products page
- API: Client-side PDF generation
- Auth: Authenticated user + tenant
- Success: PDF file downloaded with product table
- Failure: Browser error, large dataset

### Category Management Flows

**F026: List Categories**
- Entry: `/categories` page
- API: `GET /api/categories`
- Auth: Authenticated user + tenant
- Success: Categories list displayed
- Failure: API error, network timeout

**F027: Create Category**
- Entry: "Add Category" button
- API: `POST /api/categories`
- Auth: Authenticated user + tenant
- Success: Category created, appears in list
- Failure: Validation error, duplicate name, network error
- Edge: Category with default_margin_percent

**F028: Update Category**
- Entry: "Edit" button on category
- API: `PUT /api/categories/:id`
- Auth: Authenticated user + tenant
- Success: Category updated
- Failure: Category not found, validation error

**F029: Delete Category (Soft Delete)**
- Entry: "Delete" button on category
- API: `DELETE /api/categories/:id`
- Auth: Authenticated user + tenant
- Success: Category marked as inactive, products moved to "כללי"
- Failure: Category not found, network error
- Edge: Category with products → soft delete only

### Supplier Management Flows

**F030: List Suppliers**
- Entry: `/suppliers` page
- API: `GET /api/suppliers`
- Auth: Authenticated user + tenant
- Success: Suppliers list displayed
- Failure: API error

**F031: Create Supplier**
- Entry: "Add Supplier" button
- API: `POST /api/suppliers`
- Auth: Authenticated user + tenant
- Success: Supplier created, appears in list
- Failure: Validation error, duplicate name, network error
- Edge: Supplier with phone, notes

**F032: Update Supplier**
- Entry: "Edit" button on supplier
- API: `PUT /api/suppliers/:id`
- Auth: Authenticated user + tenant
- Success: Supplier updated
- Failure: Supplier not found, validation error

**F033: Delete Supplier (Soft Delete)**
- Entry: "Delete" button on supplier
- API: `DELETE /api/suppliers/:id`
- Auth: Authenticated user + tenant
- Success: Supplier marked as inactive
- Failure: Supplier not found, network error
- Edge: Supplier with prices → warning shown

### Settings Flows

**F034: View Settings**
- Entry: `/settings` page
- API: `GET /api/settings`
- Auth: Authenticated user + tenant
- Success: Settings displayed (VAT, margin, use_margin, use_vat)
- Failure: API error, settings not found

**F035: Update Settings**
- Entry: Settings form submit
- API: `PUT /api/settings`
- Auth: Authenticated user + tenant
- Role: Owner only (implied)
- Success: Settings updated, all product prices recalculated
- Failure: Validation error, network error
- Edge: Changing VAT/margin triggers bulk price recalculation

**F036: Recalculate Prices (All)**
- Entry: "Recalculate All Prices" button (if exists)
- API: `PUT /api/settings/recalculate-prices`
- Auth: Authenticated user + tenant
- Role: Owner only
- Success: All prices recalculated
- Failure: Network error, large dataset timeout

**F037: Recalculate Prices (By Category)**
- Entry: "Recalculate by Category" (if exists)
- API: `PUT /api/settings/recalculate-prices-by-category/:id`
- Auth: Authenticated user + tenant
- Role: Owner only
- Success: Category prices recalculated
- Failure: Category not found

### Import/Export Flows

**F038: Import Products (Preview)**
- Entry: `/import-export` page, file selection
- API: `POST /api/import/preview`
- Auth: Authenticated user + tenant
- Role: Owner only
- Success: Preview of import data displayed
- Failure: Invalid file format, parsing error, network error
- Edge: Large file, malformed CSV/Excel

**F039: Import Products (Apply - Merge)**
- Entry: Confirm import with "merge" mode
- API: `POST /api/import/apply?mode=merge`
- Auth: Authenticated user + tenant
- Role: Owner only
- Success: Products merged (existing updated, new created)
- Failure: Validation errors, network timeout
- Edge: Duplicate products, missing suppliers/categories

**F040: Import Products (Apply - Overwrite)**
- Entry: Confirm import with "overwrite" mode
- API: `POST /api/import/apply?mode=overwrite`
- Auth: Authenticated user + tenant
- Role: Owner only
- Success: All products replaced with imported data
- Failure: Validation errors, network timeout

**F041: Reset Tenant Data**
- Entry: "Reset All Data" button in ImportExport page
- API: `POST /api/tenant/reset`
- Auth: Authenticated user + tenant
- Role: Owner only
- Success: All tenant data deleted (products, prices, suppliers, categories)
- Failure: Network error, confirmation not given

### Admin Flows (Super Admin Only)

**F042: Admin - Check Super Admin Status**
- Entry: `/admin` page load
- API: `GET /api/admin/check`
- Auth: Authenticated user
- Role: Super admin only
- Success: Returns `{ is_super_admin: true }`
- Failure: Not super admin → 403

**F043: Admin - List All Tenants**
- Entry: `/admin` page
- API: `GET /api/admin/tenants`
- Auth: Authenticated user
- Role: Super admin only
- Success: All tenants with users and statistics displayed
- Failure: API error, network timeout

**F044: Admin - View Audit Logs**
- Entry: Audit logs section in `/admin`
- API: `GET /api/admin/audit-logs`
- Auth: Authenticated user
- Role: Super admin only
- Success: Audit logs displayed
- Failure: API error

**F045: Admin - Block User**
- Entry: "Block User" button in admin panel
- API: `POST /api/admin/block-user`
- Auth: Authenticated user
- Role: Super admin only
- Success: User blocked in tenant, cannot access
- Failure: User not found, network error

**F046: Admin - Unblock User**
- Entry: "Unblock User" button
- API: `POST /api/admin/unblock-user`
- Auth: Authenticated user
- Role: Super admin only
- Success: User unblocked, can access tenant
- Failure: User not found

**F047: Admin - Remove User from Tenant**
- Entry: "Remove User" button
- API: `DELETE /api/admin/remove-user`
- Auth: Authenticated user
- Role: Super admin only
- Success: User removed from tenant
- Failure: User not found, membership not found

**F048: Admin - Reset Tenant Data**
- Entry: "Reset Tenant Data" button
- API: `POST /api/admin/reset-tenant-data`
- Auth: Authenticated user
- Role: Super admin only
- Success: Tenant data reset
- Failure: Tenant not found, network error

**F049: Admin - Delete Tenant**
- Entry: "Delete Tenant" button
- API: `DELETE /api/admin/delete-tenant`
- Auth: Authenticated user
- Role: Super admin only
- Success: Tenant deleted completely
- Failure: Tenant not found, network error

### Tenant Management Flows (Owner Only)

**F050: Invite User to Tenant**
- Entry: Invite form (if exists in UI)
- API: `POST /api/tenants/:id/invite`
- Auth: Authenticated user + tenant
- Role: Owner only
- Success: Invite created, email sent (if implemented)
- Failure: Invalid email, user already member, network error

### Bootstrap Flow

**F051: Bootstrap - Load All Initial Data**
- Entry: App initialization after tenant selection
- API: `GET /api/bootstrap`
- Auth: Authenticated user + tenant
- Success: Returns `{ tenants, settings, suppliers, categories, tableLayoutProducts }`
- Failure: API error, network timeout
- Edge: No tenant → only tenants returned

### Utility Flows

**F052: Price Calculation**
- Entry: Product price creation/update
- Logic: `calcSellPrice()` function
- Input: cost_price, margin_percent, vat_percent, discount_percent, use_margin, use_vat
- Success: Correct sell price calculated
- Edge: use_margin=false, use_vat=false, discount applied

**F053: Name Normalization**
- Entry: Product/supplier/category creation
- Logic: `normalizeName()` function
- Input: User input string
- Success: Normalized string (trimmed, lowercase, single spaces)
- Edge: Empty string, special characters, Hebrew text

**F054: Table Layout Persistence**
- Entry: User changes column layout in Products table
- API: `GET /api/bootstrap` (includes tableLayoutProducts), save to `user_preferences`
- Auth: Authenticated user + tenant
- Success: Layout saved per user per tenant, restored on load
- Failure: Save error, load error

---

## B) TRACEABILITY MATRIX

| FlowId | Description | Happy Path | Negative/Edge Case | Auth/Permission Case | Test Type |
|--------|-------------|------------|-------------------|---------------------|-----------|
| F001 | User Login | ✅ | ✅ Invalid credentials | ✅ No auth required | Unit, Integration, E2E |
| F002 | User Signup | ✅ | ✅ Email exists | ✅ No auth required | Unit, Integration, E2E |
| F003 | Session Check | ✅ | ✅ Expired token | ✅ Session validation | Unit, Integration |
| F004 | Logout | ✅ | ✅ Network error | ✅ Auth required | Unit, Integration |
| F005 | Token Refresh | ✅ | ✅ Refresh fails | ✅ Expired token | Unit, Integration |
| F006 | Onboarding New User | ✅ | ✅ API error | ✅ Auth required | Integration, E2E |
| F007 | Create Tenant | ✅ | ✅ Duplicate name | ✅ Auth required | Integration, E2E |
| F008 | Onboarding Existing | ✅ | ✅ Tenant deleted | ✅ Auth required | Integration |
| F009 | Tenant Switch | ✅ | ✅ Invalid tenant | ✅ Multi-tenant access | Integration, E2E |
| F010 | Auto Accept Invites | ✅ | ✅ No invites | ✅ Auth required | Integration |
| F011 | Manual Accept Invites | ✅ | ✅ Expired invite | ✅ Auth required | Integration |
| F012 | Super Admin Access | ✅ | ✅ Not super admin | ✅ Super admin only | Integration, E2E |
| F013 | List Products | ✅ | ✅ Empty results | ✅ Tenant required | Integration, E2E |
| F014 | Search Products | ✅ | ✅ Invalid search | ✅ Tenant required | Integration |
| F015 | Filter by Supplier | ✅ | ✅ Invalid supplier | ✅ Tenant required | Integration |
| F016 | Filter by Category | ✅ | ✅ Invalid category | ✅ Tenant required | Integration |
| F017 | Sort Products | ✅ | ✅ Invalid sort | ✅ Tenant required | Integration |
| F018 | Pagination | ✅ | ✅ Out of bounds | ✅ Tenant required | Integration |
| F019 | Create Product | ✅ | ✅ Duplicate product | ✅ Tenant required | Integration, E2E |
| F020 | Edit Product | ✅ | ✅ Product not found | ✅ Tenant required | Integration |
| F021 | Delete Product | ✅ | ✅ Product not found | ✅ Tenant required | Integration |
| F022 | Add Price | ✅ | ✅ Invalid supplier | ✅ Tenant required | Integration |
| F023 | Price History | ✅ | ✅ No history | ✅ Tenant required | Integration |
| F024 | Export CSV | ✅ | ✅ Network error | ✅ Tenant required | Integration |
| F025 | Export PDF | ✅ | ✅ Large dataset | ✅ Tenant required | Unit, Integration |
| F026 | List Categories | ✅ | ✅ API error | ✅ Tenant required | Integration |
| F027 | Create Category | ✅ | ✅ Duplicate name | ✅ Tenant required | Integration |
| F028 | Update Category | ✅ | ✅ Not found | ✅ Tenant required | Integration |
| F029 | Delete Category | ✅ | ✅ Has products | ✅ Tenant required | Integration |
| F030 | List Suppliers | ✅ | ✅ API error | ✅ Tenant required | Integration |
| F031 | Create Supplier | ✅ | ✅ Duplicate name | ✅ Tenant required | Integration |
| F032 | Update Supplier | ✅ | ✅ Not found | ✅ Tenant required | Integration |
| F033 | Delete Supplier | ✅ | ✅ Has prices | ✅ Tenant required | Integration |
| F034 | View Settings | ✅ | ✅ Not found | ✅ Tenant required | Integration |
| F035 | Update Settings | ✅ | ✅ Validation error | ✅ Owner only | Integration |
| F036 | Recalc All Prices | ✅ | ✅ Timeout | ✅ Owner only | Integration |
| F037 | Recalc Category Prices | ✅ | ✅ Category not found | ✅ Owner only | Integration |
| F038 | Import Preview | ✅ | ✅ Invalid file | ✅ Owner only | Integration |
| F039 | Import Merge | ✅ | ✅ Validation errors | ✅ Owner only | Integration |
| F040 | Import Overwrite | ✅ | ✅ Validation errors | ✅ Owner only | Integration |
| F041 | Reset Data | ✅ | ✅ Network error | ✅ Owner only | Integration, E2E |
| F042 | Admin Check | ✅ | ✅ Not super admin | ✅ Super admin only | Integration |
| F043 | Admin List Tenants | ✅ | ✅ API error | ✅ Super admin only | Integration |
| F044 | Admin Audit Logs | ✅ | ✅ API error | ✅ Super admin only | Integration |
| F045 | Admin Block User | ✅ | ✅ User not found | ✅ Super admin only | Integration |
| F046 | Admin Unblock User | ✅ | ✅ User not found | ✅ Super admin only | Integration |
| F047 | Admin Remove User | ✅ | ✅ Not found | ✅ Super admin only | Integration |
| F048 | Admin Reset Tenant | ✅ | ✅ Tenant not found | ✅ Super admin only | Integration |
| F049 | Admin Delete Tenant | ✅ | ✅ Tenant not found | ✅ Super admin only | Integration |
| F050 | Invite User | ✅ | ✅ Already member | ✅ Owner only | Integration |
| F051 | Bootstrap | ✅ | ✅ No tenant | ✅ Tenant optional | Integration |
| F052 | Price Calculation | ✅ | ✅ Edge cases | ✅ N/A | Unit |
| F053 | Name Normalization | ✅ | ✅ Edge cases | ✅ N/A | Unit |
| F054 | Table Layout | ✅ | ✅ Save error | ✅ Tenant required | Integration |

---

## C) TEST COVERAGE SUMMARY

- **Total Flows**: 54
- **Unit Tests**: 3 (F052, F053, F025 partial)
- **Integration Tests**: 48
- **E2E Tests**: 8 (Critical flows: F001, F002, F006, F007, F009, F012, F019, F041)

---

## D) AUTH/TENANT TEST FOCUS

### Authentication Tests
- ✅ Login with valid/invalid credentials
- ✅ Session restore on page reload
- ✅ Token refresh on 401
- ✅ Logout clears session and redirects
- ✅ Protected routes redirect to login

### Tenant Tests
- ✅ Wrong tenant ID → 403
- ✅ No tenant ID → 400
- ✅ Tenant switch updates all API calls
- ✅ Blocked user → 403
- ✅ Cross-tenant data leakage prevention
- ✅ Onboarding: loading → choice → ready states

### Permission Tests
- ✅ Owner-only endpoints (settings, invites, reset) → 403 for worker
- ✅ Super admin endpoints → 403 for regular user
- ✅ Worker can read/write products but not settings

---

**Last Updated**: Based on codebase analysis as of current date
