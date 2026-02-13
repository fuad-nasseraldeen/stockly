import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './lib/supabaseClient';
import { setTenantIdForApi } from './lib/api';
import { Button } from './components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { TenantProvider } from './contexts/TenantContext';
import { useTenant } from './hooks/useTenant';
import { useSuperAdmin } from './hooks/useSuperAdmin';
import { useBootstrap } from './hooks/useBootstrap';
import { AppHeader } from './components/layout/AppHeader';
import { BottomTabs } from './components/layout/BottomTabs';
import { FloatingActionButton } from './components/ui/FloatingActionButton';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Products from './pages/Products';
import NewProduct from './pages/NewProduct';
import Categories from './pages/Categories';
import Suppliers from './pages/Suppliers';
import Settings from './pages/Settings';
import EditProduct from './pages/EditProduct';
import ImportExport from './pages/ImportExport';
import Admin from './pages/Admin';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import { OnboardingRouter } from './components/OnboardingRouter';
import { SplashScreen } from './components/SplashScreen';

function DarkModeWidget() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="fixed z-50 left-4 sm:left-6 bottom-24 sm:bottom-6 h-11 w-11 rounded-full shadow-lg border-2 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
      aria-label={isDark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
      title={isDark ? 'Light Mode' : 'Dark Mode'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInitialSplash, setShowInitialSplash] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Intro splash – בכל רענון מלא של האפליקציה
  // הספלאש יקרא ל-onDone כשהאנימציה מסתיימת - אין צורך ב-timeout נפרד

  const handleLogout = async () => {
    // CRITICAL: Sign out from Supabase first
    await supabase.auth.signOut();
    
    // CRITICAL: Clear tenantId from module-level variable and localStorage
    // This prevents cross-tenant data leakage when switching users
    setTenantIdForApi(null);
    localStorage.removeItem('currentTenantId');
    
    // CRITICAL: Clear React Query cache to prevent cached tenant/admin data from leaking to next user
    queryClient.clear();
    
    setUser(null);
    
    // Navigate to login page (replace: true to prevent back button issues)
    window.location.href = '/login';
  };

  // Splash פתיחה – לפני שמגיעים בכלל למסכי לוגאין/רישום
  if (showInitialSplash && !user) {
    return <SplashScreen onDone={() => setShowInitialSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-primary/20 to-background">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">טוען את המערכת...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <TenantProvider>
        <AppContent user={user} onLogout={handleLogout} />
      </TenantProvider>
    </BrowserRouter>
  );
}

function AppContent({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const location = useLocation();

  // Fetch bootstrap data once user is logged in
  // Bootstrap will automatically use current tenant if selected (via x-tenant-id header)
  // This seeds React Query cache so existing hooks can use cached data instantly
  useBootstrap(!!user);

  if (location.pathname === '/reset-password') {
    return <ResetPassword />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-primary/20 to-background">
        <AnimatePresence mode="wait">
          <motion.div
            key="auth-shell"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="w-full max-w-md px-4"
          >
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<Login />} />
              <Route path="*" element={<Login />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <OnboardingRouter>
      <AppWithNavigation user={user} onLogout={onLogout} />
    </OnboardingRouter>
  );
}

/**
 * AdminRouteGuard - Protects /admin route
 * 
 * CRITICAL SECURITY: If user is not super admin, redirects away from /admin
 * This ensures normal users cannot access admin pages even if they navigate directly
 */
function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { data: isSuperAdmin, isLoading } = useSuperAdmin(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect if check is complete and user is NOT super admin
    if (!isLoading && isSuperAdmin === false) {
      // Redirect to home or no-access page
      navigate('/', { replace: true });
    }
  }, [isSuperAdmin, isLoading, navigate]);

  // Show nothing while checking (or if not admin)
  if (isLoading || isSuperAdmin !== true) {
    return null;
  }

  return <>{children}</>;
}

function AppWithNavigation({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { currentTenant } = useTenant();
  const { data: isSuperAdmin } = useSuperAdmin();
  const location = useLocation();
 
  // Super admin can access /admin without a tenant
  const isAdminPage = location.pathname === '/admin';
  const canAccess = isAdminPage || currentTenant || (isSuperAdmin === true && isAdminPage);
  
  // Only show navigation if we have a tenant or if super admin accessing admin page
  if (!canAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-primary/20 to-background">
      <AppHeader user={user} onLogout={onLogout} isSuperAdmin={isSuperAdmin === true} />
      <main className="w-full flex justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-36 sm:pb-8">
        <div className="w-full max-w-6xl">
          <Routes>
            <Route path="/products" element={<Products />} />
            <Route path="/products/new" element={<NewProduct />} />
            <Route path="/products/:id/edit" element={<EditProduct />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/import-export" element={<ImportExport />} />
            <Route 
              path="/admin" 
              element={
                <AdminRouteGuard>
                  <Admin />
                </AdminRouteGuard>
              } 
            />
            <Route path="/settings" element={<Settings />} />
            <Route path="/" element={<Navigate to="/products" />} />
            <Route path="*" element={<Navigate to="/products" replace />} />
          </Routes>
        </div>
      </main>
      <DarkModeWidget />
      <BottomTabs />
      <FloatingActionButton to="/products/new" ariaLabel="הוספת מוצר חדש" />
    </div>
  );
}

export default App;
