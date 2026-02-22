# זרימת טננטים (Tenant Flow)

> עדכון 2026-02: הזרימה תקפה. הוסרו כפילויות תיעודיות והמקור המרכזי למסכי on/offboarding הוא גם `04-component-flows.md`.

## סקירה כללית
מסמך זה מתאר את הזרימה המלאה של ניהול טננטים (חנויות), החלפת טננט, ואימות גישה.

---

## 1. TenantContext - ניהול טננטים

**מיקום:** `frontend/src/contexts/TenantContext.tsx`

### 1.1 הגדרת Context

```typescript
export type Tenant = {
  id: string;
  name: string;
  role: 'owner' | 'worker';
  created_at: string;
};

export type TenantContextType = {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  isLoading: boolean;
  setCurrentTenant: (tenant: Tenant | null) => void;
  refetchTenants: () => void;
};
```

### 1.2 TenantProvider

```typescript
export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);
  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => tenantsApi.list(),
  });

  // Load tenant from localStorage on mount
  useEffect(() => {
    if (tenants.length > 0) {
      const saved = localStorage.getItem('currentTenantId');
      let selectedTenant: Tenant | null = null;
      
      if (saved) {
        const tenant = tenants.find(t => t.id === saved);
        if (tenant) {
          selectedTenant = tenant;
        } else {
          selectedTenant = tenants[0]; // Fallback to first
        }
      } else {
        selectedTenant = tenants[0]; // No saved tenant
      }
      
      if (selectedTenant) {
        localStorage.setItem('currentTenantId', selectedTenant.id);
        setCurrentTenantState(selectedTenant);
      }
    }
  }, [tenants]);

  const setCurrentTenant = (tenant: Tenant | null) => {
    setCurrentTenantState(tenant);
    if (tenant) {
      localStorage.setItem('currentTenantId', tenant.id);
    } else {
      localStorage.removeItem('currentTenantId');
    }
  };

  return (
    <TenantContext.Provider value={{ currentTenant, tenants, isLoading, setCurrentTenant, refetchTenants }}>
      {children}
    </TenantContext.Provider>
  );
}
```

**תפקיד:**
1. **שליפת טננטים:** React Query קורא ל-`tenantsApi.list()`
2. **שמירה ב-localStorage:** הטננט הנוכחי נשמר ב-`currentTenantId`
3. **טעינה אוטומטית:** בעת טעינה, בודק אם יש טננט שמור ב-localStorage
4. **Fallback:** אם אין טננט שמור או שהוא לא קיים → בוחר את הראשון

---

## 2. שליחת Tenant ID ל-API

**מיקום:** `frontend/src/lib/api.ts`

```typescript
export async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
  
  // ... fetch ...
}
```

**תפקיד:**
- `getTenantId()`: קורא את `currentTenantId` מ-localStorage
- מוסיף `x-tenant-id` header לכל קריאת API
- `skipTenantHeader`: אפשרות לדלג על header (למשל ב-admin routes)

**`getTenantId()`:**
```typescript
export function getTenantId(): string | null {
  return localStorage.getItem('currentTenantId');
}
```

---

## 3. אימות Tenant בבקאנד

**מיקום:** `backend/src/middleware/auth.ts`

### 3.1 `requireTenant` Middleware

```typescript
export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  const user = (req as any).user as AuthedUser | undefined;

  if (!user) {
    return res.status(401).json({ error: 'נדרש להתחבר' });
  }

  if (!tenantId) {
    return res.status(400).json({ error: 'נדרש x-tenant-id header' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return res.status(400).json({ error: 'x-tenant-id חייב להיות UUID תקין' });
  }

  // Check membership using service role (bypasses RLS)
  const { data: membership, error } = await supabase
    .from('memberships')
    .select('role, is_blocked')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !membership) {
    return res.status(403).json({ error: 'אין לך גישה לטננט זה' });
  }

  // Check if user is blocked
  if (membership.is_blocked) {
    return res.status(403).json({ error: 'חשבונך נחסם בטננט זה. נא ליצור קשר עם בעל החנות.' });
  }

  (req as any).tenant = {
    tenantId,
    role: membership.role as 'owner' | 'worker',
  } as TenantContext;

  next();
}
```

**תפקיד:**
1. **קריאת header:** `x-tenant-id` מה-request
2. **ולידציה:** בודק שזה UUID תקין
3. **בדיקת membership:** בודק בטבלת `memberships` שהמשתמש שייך לטננט
4. **בדיקת חסימה:** בודק אם המשתמש חסום
5. **הוספת context:** מוסיף `tenant` ל-`req` עם `tenantId` ו-`role`

---

## 4. TenantSwitcher - החלפת טננט

**מיקום:** `frontend/src/components/TenantSwitcher.tsx`

```typescript
export function TenantSwitcher() {
  const { currentTenant, tenants, setCurrentTenant } = useTenant();

  const handleTenantChange = (tenantId: string) => {
    const tenant = tenants.find(t => t.id === tenantId);
    if (tenant) {
      setCurrentTenant(tenant);
      // Optionally refresh data
      window.location.reload(); // או queryClient.invalidateQueries()
    }
  };

  return (
    <Select value={currentTenant?.id || ''} onChange={(e) => handleTenantChange(e.target.value)}>
      {tenants.map((tenant) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.name} ({tenant.role === 'owner' ? 'בעלים' : 'עובד'})
        </option>
      ))}
    </Select>
  );
}
```

**תפקיד:**
- מציג dropdown עם כל הטננטים של המשתמש
- מאפשר החלפת טננט
- מעדכן את `currentTenant` ב-context
- משנה את `localStorage` → כל קריאת API הבאה תשלח את ה-tenant החדש

---

## 5. OnboardingRouter - בדיקת גישה

**מיקום:** `frontend/src/components/OnboardingRouter.tsx`

### 5.1 בדיקת טננטים

```typescript
export function OnboardingRouter({ children }: { children: React.ReactNode }) {
  const { tenants, isLoading, refetchTenants } = useTenant();
  const { data: isSuperAdmin } = useSuperAdmin();
  const [step, setStep] = useState<OnboardingStep>('loading');

  // Step 1: Accept pending invites
  useEffect(() => {
    if (isLoading) {
      setStep('loading');
      return;
    }

    const checkInvitesAndTenants = async () => {
      // Accept any pending invites
      try {
        await invitesApi.accept();
      } catch (error) {
        // Ignore errors
      }

      // Refetch tenants after accepting invites
      await refetchTenants();
    };

    checkInvitesAndTenants();
  }, [isLoading, refetchTenants]);

  // Step 2: Determine next step
  useEffect(() => {
    if (isLoading) {
      setStep('loading');
      return;
    }

    // Super admin can access /admin even without tenants
    if (isSuperAdmin === true && location.pathname === '/admin') {
      setStep('ready');
      return;
    }

    if (tenants.length >= 1) {
      setStep('ready');
    } else if (tenants.length === 0) {
      setStep('choice'); // Show choice screen
    }
  }, [tenants, isLoading, isSuperAdmin, location.pathname]);
```

**תפקיד:**
1. **קבלת הזמנות:** מקבל הזמנות ממתינות אוטומטית
2. **רענון טננטים:** טוען מחדש את רשימת הטננטים
3. **בדיקת גישה:**
   - אם יש טננטים → `ready` (מציג את האפליקציה)
   - אם אין טננטים → `choice` (מציג מסך בחירה)
   - Super admin יכול לגשת ל-`/admin` גם בלי טננטים

### 5.2 מסך בחירה

```typescript
if (step === 'choice') {
  return (
    <Card>
      {/* Super Admin Option */}
      {isSuperAdmin === true && (
        <Button onClick={() => navigate('/admin')}>
          ניהול מערכת
        </Button>
      )}

      {/* Create New Store */}
      <Button onClick={() => navigate('/create-tenant')}>
        זה חנות חדשה
      </Button>

      {/* Existing Store */}
      <Button onClick={() => navigate('/no-access')}>
        זה חנות קיימת
      </Button>
    </Card>
  );
}
```

---

## 6. יצירת טננט חדש

**מיקום:** `frontend/src/pages/CreateTenant.tsx`

```typescript
const handleCreate = async (name: string) => {
  try {
    await tenantsApi.create({ name });
    await refetchTenants(); // Refresh list
    navigate('/products');
  } catch (error) {
    // Handle error
  }
};
```

**Backend:** `backend/src/routes/tenants.ts`

```typescript
router.post('/', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { name } = req.body;

  // Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({ name })
    .select()
    .single();

  // Create membership (owner)
  await supabase
    .from('memberships')
    .insert({
      user_id: user.id,
      tenant_id: tenant.id,
      role: 'owner',
    });

  return res.json(tenant);
});
```

---

## 7. הזמנות (Invites)

### 7.1 שליחת הזמנה

**Backend:** `backend/src/routes/invites.ts`

```typescript
router.post('/', requireAuth, ownerOnly, async (req, res) => {
  const tenant = (req as any).tenant;
  const { email, role } = req.body;

  // Find user by email
  const { data: user } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('email', email)
    .single();

  // Create invite
  await supabase
    .from('invites')
    .insert({
      tenant_id: tenant.tenantId,
      user_id: user.user_id,
      role: role || 'worker',
      invited_by: (req as any).user.id,
    });

  return res.json({ success: true });
});
```

### 7.2 קבלת הזמנה

**Frontend:** `frontend/src/lib/api.ts`

```typescript
accept: async (): Promise<void> => {
  await apiRequest('/api/invites/accept', { method: 'POST' });
}
```

**Backend:**

```typescript
router.post('/accept', requireAuth, async (req, res) => {
  const user = (req as any).user;

  // Find pending invite
  const { data: invite } = await supabase
    .from('invites')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .single();

  if (!invite) {
    return res.status(404).json({ error: 'לא נמצאה הזמנה' });
  }

  // Create membership
  await supabase
    .from('memberships')
    .insert({
      user_id: user.id,
      tenant_id: invite.tenant_id,
      role: invite.role,
    });

  // Update invite status
  await supabase
    .from('invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  return res.json({ success: true });
});
```

---

## 8. זרימה מלאה - שימוש בטננט

```
User logs in
    ↓
OnboardingRouter checks tenants
    ↓
TenantContext loads tenants from API
    ↓
Selects tenant from localStorage (or first available)
    ↓
Saves to localStorage: currentTenantId
    ↓
All API requests include: x-tenant-id header
    ↓
Backend: requireTenant middleware
    ↓
Checks membership in database
    ↓
If valid → add tenant context to request
    ↓
Route handler uses tenant.tenantId for queries
```

---

## 9. תפקידים (Roles)

### 9.1 Owner (בעלים)
- יכול ליצור טננט
- יכול לשלוח הזמנות
- יכול לנהל הגדרות
- יכול לחסום משתמשים
- גישה מלאה לכל הנתונים

### 9.2 Worker (עובד)
- גישה לקריאה/כתיבה של מוצרים
- לא יכול לנהל הגדרות
- לא יכול לשלוח הזמנות
- לא יכול לחסום משתמשים

### 9.3 Super Admin
- גישה לכל הטננטים
- גישה לדף `/admin`
- יכול לנהל משתמשים וטננטים
- לא צריך טננט כדי לגשת ל-admin

---

## 10. אבטחה

### 10.1 Frontend
- Tenant ID נשמר ב-localStorage
- נשלח בכל קריאת API
- לא ניתן לשנות ללא אימות

### 10.2 Backend
- כל route מוגן עם `requireTenant`
- בודק membership לפני כל פעולה
- בודק חסימה (is_blocked)
- משתמש ב-service role client (bypasses RLS)

### 10.3 Database
- RLS policies מגבילות גישה לפי membership
- Membership table מגדיר גישה
- Invites table מטפל בהזמנות

---

## סיכום

1. **טעינת טננטים:** `TenantContext` טוען מהדאטה בייס
2. **שמירה:** `currentTenantId` ב-localStorage
3. **שליחה:** `x-tenant-id` header בכל API request
4. **אימות:** `requireTenant` middleware בודק membership
5. **החלפה:** `TenantSwitcher` מאפשר החלפת טננט
6. **גישה:** `OnboardingRouter` בודק גישה ומציג מסך מתאים
