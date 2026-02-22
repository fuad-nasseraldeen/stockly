# Onboarding Implementation Summary

> עדכון 2026-02: זרימת onboarding נשארה יציבה. למסכי products/import/settings המעודכנים ראה `04-component-flows.md`.

## Flow Overview

### New User Flow (No Tenants)
1. User signs up/logs in
2. `OnboardingRouter` calls `POST /api/invites/accept` (best-effort)
3. `OnboardingRouter` calls `GET /api/tenants`
4. If 0 tenants → Show choice screen:
   - **"This is a NEW store"** → Navigate to `/create-tenant`
   - **"This is an EXISTING store"** → Navigate to `/no-access`
5. User creates tenant → Set as current → Navigate to `/products`

### Existing User Flow (Has Tenants)
1. User logs in
2. `OnboardingRouter` accepts pending invites
3. `OnboardingRouter` fetches tenants
4. If ≥1 tenants → Set current tenant (from localStorage or first) → Show main app

### Invite Acceptance Flow
1. Owner invites user by email
2. User signs up/logs in
3. `OnboardingRouter` automatically accepts all pending invites for user's email
4. Memberships are created
5. User sees tenants and can access them

## New Components & Files

### Frontend

1. **`frontend/src/components/OnboardingRouter.tsx`**
   - Handles onboarding logic after authentication
   - Accepts invites, fetches tenants, determines next step
   - Shows choice screen if no tenants
   - Routes to CreateTenant or NoAccess based on user choice

2. **`frontend/src/pages/CreateTenant.tsx`**
   - Form to create new tenant
   - Input: tenant name (required)
   - On success: sets tenant as current, navigates to products

3. **`frontend/src/pages/NoAccess.tsx`** (updated)
   - Shows user email
   - Instructions to get invite
   - "Check again" button that accepts invites and refetches tenants

4. **`frontend/src/lib/api.ts`** (updated)
   - Added `invitesApi.accept()` function

### Backend

1. **`backend/src/routes/invites.ts`** (new)
   - `POST /api/invites/accept` endpoint
   - Accepts all pending invites for logged-in user's email
   - Creates memberships, marks invites as accepted
   - Returns counts: accepted, already_member, not_found

2. **`backend/api/index.ts`** (updated)
   - Added `/api/invites` route

## Routes

### Frontend Routes
- `/onboarding` - Choice screen (new store vs existing)
- `/create-tenant` - Create new tenant form
- `/no-access` - No access screen with refresh button
- `/products`, `/categories`, etc. - Main app (only accessible with tenant)

### Backend Routes
- `POST /api/invites/accept` - Accept all pending invites for user
- `GET /api/tenants` - List user's tenants
- `POST /api/tenants` - Create new tenant (makes caller owner)
- `POST /api/tenants/:id/invite` - Invite user (owner-only)

## Security Rules (Enforced)

✅ **No auto-tenant creation** - Users must explicitly choose to create tenant
✅ **Invite-only access** - Users can only access tenants via membership or invite
✅ **Owner-only invites** - Only owners can invite users
✅ **RLS protection** - Backend checks membership via `requireTenant` middleware
✅ **x-tenant-id header** - All tenant-scoped requests require header

## Environment Variables

No new env vars required. Uses existing:
- `VITE_API_URL` (frontend)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (backend)

## Testing Checklist

- [ ] New user signs up → sees choice screen
- [ ] New user chooses "NEW store" → creates tenant → enters app
- [ ] New user chooses "EXISTING store" → sees NoAccess → gets invited → can access
- [ ] Existing user logs in → automatically enters app with tenant
- [ ] User with pending invite → invite auto-accepted → tenant appears
- [ ] "Check again" button → accepts invites → tenant appears
- [ ] User without membership → cannot access tenant endpoints (even with spoofed x-tenant-id)
- [ ] Tenant switcher works with multiple tenants
- [ ] Last used tenant persists in localStorage

## Key Implementation Details

1. **OnboardingRouter** wraps authenticated routes and handles routing logic
2. **TenantContext** automatically sets currentTenant from localStorage or first tenant
3. **Invite acceptance** happens automatically on login (best-effort, ignores errors)
4. **NoAccess screen** allows manual refresh to check for new invites
5. **CreateTenant** explicitly creates tenant (no auto-creation)

## Hebrew RTL & Mobile

All new screens are:
- ✅ Hebrew RTL layout
- ✅ Mobile-first responsive
- ✅ Consistent with existing UI components
