import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './lib/supabase';
import { setTenantIdForApi } from './lib/api';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { Menu, X } from 'lucide-react';
import { TenantProvider } from './contexts/TenantContext';
import { useTenant } from './hooks/useTenant';
import { TenantSwitcher } from './components/TenantSwitcher';
import { useSuperAdmin } from './hooks/useSuperAdmin';
import { useBootstrap } from './hooks/useBootstrap';

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
import { OnboardingRouter } from './components/OnboardingRouter';
import { SplashScreen } from './components/SplashScreen';

function Navigation({ user, onLogout }: { user: User; onLogout: () => void }) {
  const location = useLocation();
  const { currentTenant } = useTenant();
  const { data: isSuperAdmin } = useSuperAdmin();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ path: string; label: string }> = [
    { path: '/products', label: 'מוצרים' },
    { path: '/suppliers', label: 'ספקים' },
    { path: '/categories', label: 'קטגוריות' },
    { path: '/import-export', label: 'ייבוא' },
    { path: '/settings', label: 'הגדרות' },
  ];

  const isActive = (path: string) => location.pathname === path;
  return (
    <>
      <header className="sticky top-0 z-50 border-b-2 border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-sm">S</span>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground">Stockly</h1>
                  <p className="text-[10px] text-muted-foreground leading-tight hidden sm:block">
                    ניהול מחירים לפי ספק
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Desktop Navigation */}
              <nav className="hidden sm:flex items-center gap-1">
                {navItems.map((item) => (
                  <Button
                    key={item.path}
                    asChild
                    variant="ghost"
                    size="sm"
                    className={isActive(item.path) ? 'bg-accent' : ''}
                  >
                    <Link to={item.path} className="px-3 py-1.5 text-sm font-medium">
                      {item.label}
                    </Link>
                  </Button>
                ))}
                {/* Super Admin Button - Desktop */}
                {isSuperAdmin === true && (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className={isActive('/admin') ? 'bg-accent' : ''}
                  >
                    <Link to="/admin" className="px-3 py-1.5 text-sm font-medium">
                      ניהול מערכת
                    </Link>
                  </Button>
                )}
              </nav>
              <div className="hidden sm:block h-6 w-px bg-border mx-1" />
              <TenantSwitcher />
              <div className="hidden sm:block h-6 w-px bg-border mx-1" />
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[120px]">
                  {user.email}
                </span>
                <Button variant="outline" size="sm" onClick={onLogout} className="text-xs">
                  יציאה
                </Button>
              </div>
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="תפריט"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Dialog */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-[85vw] max-w-sm bg-background border-l-2 border-border shadow-xl">
            <div className="flex items-center justify-between p-4 border-b-2 border-border">
              <h2 className="text-lg font-bold">תפריט</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="סגור"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex flex-col p-2 overflow-y-auto h-[calc(100vh-4rem)]">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {/* Super Admin Button - Mobile */}
              {isSuperAdmin === true && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                    isActive('/admin')
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  ניהול מערכת
                </Link>
              )}
              <div className="border-t-2 border-border my-2" />
              <div className="px-4 py-2 space-y-2">
                {currentTenant && (
                  <div className="p-2 bg-muted rounded-lg">
                    <p className="text-xs font-medium">{currentTenant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentTenant.role === 'owner' ? 'בעלים' : 'עובד'}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground break-all">{user.email}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full"
                >
                  יציאה
                </Button>
              </div>
            </nav>
          </div>
        </div>
      </Dialog>
    </>
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
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShowInitialSplash(false);
    }, 2000); // 2s – תואם לאנימציית הספלאש החדשה

    return () => window.clearTimeout(timeout);
  }, []);

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
    return <SplashScreen mode="enter" />;
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
  // Fetch bootstrap data once user is logged in
  // Bootstrap will automatically use current tenant if selected (via x-tenant-id header)
  // This seeds React Query cache so existing hooks can use cached data instantly
  useBootstrap(!!user);

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
              <Route path="*" element={<Navigate to="/login" />} />
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
  console.log('isSuperAdmin', isSuperAdmin);
  const canAccess = isAdminPage || currentTenant || (isSuperAdmin === true && isAdminPage);
  
  // Only show navigation if we have a tenant or if super admin accessing admin page
  if (!canAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-primary/20 to-background">
      <Navigation user={user} onLogout={onLogout} />
      <main className="w-full flex justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
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
    </div>
  );
}

export default App;
