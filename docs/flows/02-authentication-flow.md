# זרימת אימות והתחברות (Authentication Flow)

## סקירה כללית
מסמך זה מתאר את הזרימה המלאה של התחברות משתמש, אימות, וניהול סשן.

---

## 1. התחברות - `Login.tsx`

**מיקום:** `frontend/src/pages/Login.tsx`

### 1.1 טופס התחברות

```typescript
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    navigate('/products');
  } catch (err: any) {
    setError(err.message || 'שגיאה בהתחברות');
  } finally {
    setLoading(false);
  }
};
```

**תפקיד:**
- משתמש ב-Supabase Auth API
- `signInWithPassword`: אימות עם אימייל וסיסמה
- אם הצליח → מעבר ל-`/products`
- אם נכשל → הצגת שגיאה

**Supabase Client:**
```typescript
// frontend/src/lib/supabase.ts
export const supabase: SupabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

---

## 2. בדיקת סשן - `App.tsx`

**מיקום:** `frontend/src/App.tsx`

### 2.1 בדיקה ראשונית

```typescript
useEffect(() => {
  // בדיקת סשן קיים
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
    setLoading(false);
  });

  // האזנה לשינויים בסשן
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });

  return () => subscription.unsubscribe();
}, []);
```

**תפקיד:**
- `getSession()`: בודק אם יש סשן פעיל
- `onAuthStateChange`: מאזין לשינויים (התחברות, התנתקות, refresh)
- מעדכן את `user` state בהתאם

### 2.2 ניתוב לפי מצב משתמש

```typescript
function AppContent({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  if (!user) {
    // משתמש לא מחובר → דפי login/signup
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  // משתמש מחובר → אפליקציה ראשית
  return (
    <OnboardingRouter>
      <AppWithNavigation user={user} onLogout={onLogout} />
    </OnboardingRouter>
  );
}
```

---

## 3. יציאה - `App.tsx`

**מיקום:** `frontend/src/App.tsx`

```typescript
const handleLogout = async () => {
  await supabase.auth.signOut();
  setUser(null);
};
```

**תפקיד:**
- `signOut()`: מוחק את הסשן ב-Supabase
- מעדכן `user` ל-`null`
- React Router מנתב אוטומטית ל-`/login`

---

## 4. אימות בבקאנד - `middleware/auth.ts`

**מיקום:** `backend/src/middleware/auth.ts`

### 4.1 `requireAuth` Middleware

```typescript
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (!token) {
    return res.status(401).json({ error: 'נדרש להתחבר כדי לבצע פעולה זו' });
  }

  const authSupabase = getAuthClient();
  
  authSupabase.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) {
        return res.status(401).json({ error: 'ההתחברות פגה תוקף, נא להתחבר מחדש' });
      }

      (req as any).user = { id: data.user.id, email: data.user.email };
      (req as any).authToken = token;
      next();
    })
    .catch(() => res.status(401).json({ error: 'שגיאת אימות, נסה שוב' }));
}
```

**תפקיד:**
1. קורא את `Authorization: Bearer <token>` מה-headers
2. מאמת את ה-token עם Supabase
3. אם תקין → מוסיף `user` ל-`req` וממשיך
4. אם לא תקין → מחזיר 401

**Supabase Auth Client:**
```typescript
function getAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!globalThis.__stocklyAuthSupabase) {
    globalThis.__stocklyAuthSupabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return globalThis.__stocklyAuthSupabase;
}
```

---

## 5. שליחת Token מהפרונטאנד

**מיקום:** `frontend/src/lib/api.ts`

```typescript
export async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // ... fetch ...
}
```

**תפקיד:**
- `getAuthToken()`: מקבל את ה-token הנוכחי מ-Supabase
- מוסיף `Authorization: Bearer <token>` ל-headers
- כל קריאה ל-API כוללת את ה-token

**`getAuthToken()`:**
```typescript
async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
```

---

## 6. Refresh Token אוטומטי

**מיקום:** `frontend/src/lib/api.ts`

```typescript
if (!response.ok) {
  // Handle 401 (Unauthorized) - token expired or invalid
  if (response.status === 401) {
    // Try to refresh the session
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError || !session) {
      // Refresh failed - clear session and redirect to login
      await supabase.auth.signOut();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    
    // Retry the request with new token
    const newHeaders = { ...headers, Authorization: `Bearer ${session.access_token}` };
    const retryResponse = await fetch(url, { ...fetchOptions, headers: newHeaders });
    // ... handle retry response ...
  }
}
```

**תפקיד:**
- אם קיבלנו 401 → מנסה לרענן את הסשן
- אם הצליח → חוזר על הבקשה עם token חדש
- אם נכשל → מנתב ל-login

---

## 7. זרימה מלאה - התחברות

```
User enters email + password (Login.tsx)
    ↓
supabase.auth.signInWithPassword()
    ↓
Supabase validates credentials
    ↓
Returns session with access_token + refresh_token
    ↓
onAuthStateChange fires
    ↓
App.tsx updates user state
    ↓
Navigate to /products
    ↓
OnboardingRouter checks tenants
    ↓
AppWithNavigation renders
```

---

## 8. זרימה מלאה - קריאת API

```
Frontend: apiRequest()
    ↓
getAuthToken() → supabase.auth.getSession()
    ↓
Add Authorization: Bearer <token> header
    ↓
fetch → Backend API
    ↓
Backend: requireAuth middleware
    ↓
Extract token from Authorization header
    ↓
supabase.auth.getUser(token)
    ↓
If valid → add user to req, continue
    ↓
If invalid → return 401
    ↓
Frontend: if 401 → refreshSession()
    ↓
Retry request with new token
```

---

## 9. אבטחה

### 9.1 Frontend
- Token נשמר ב-Supabase Client (לא ב-localStorage ישירות)
- Token נשלח בכל קריאת API
- Refresh אוטומטי אם token פג תוקף

### 9.2 Backend
- כל route מוגן עם `requireAuth`
- Token מאומת עם Supabase לפני כל פעולה
- אין גישה לנתונים ללא token תקין

### 9.3 Supabase
- JWT tokens עם expiration
- Refresh tokens לחדש access tokens
- RLS (Row Level Security) ברמת הדאטה בייס

---

## 10. דפי אימות

### 10.1 Login (`/login`)
- טופס עם אימייל וסיסמה
- קישור ל-signup
- הצגת שגיאות

### 10.2 Signup (`/signup`)
- טופס הרשמה
- יצירת משתמש חדש ב-Supabase
- מעבר אוטומטי ל-login אחרי הרשמה

### 10.3 Protected Routes
- כל הדפים חוץ מ-login/signup דורשים אימות
- אם לא מחובר → redirect ל-`/login`

---

## סיכום

1. **התחברות:** `supabase.auth.signInWithPassword()`
2. **בדיקת סשן:** `getSession()` + `onAuthStateChange()`
3. **שליחת token:** `Authorization: Bearer <token>` header
4. **אימות בבקאנד:** `requireAuth` middleware
5. **Refresh:** אוטומטי אם token פג תוקף
6. **יציאה:** `signOut()` + clear state
