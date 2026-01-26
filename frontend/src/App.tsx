import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { Menu, X } from 'lucide-react';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { TenantSwitcher } from './components/TenantSwitcher';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Products from './pages/Products';
import NewProduct from './pages/NewProduct';
import Categories from './pages/Categories';
import Suppliers from './pages/Suppliers';
import Settings from './pages/Settings';
import EditProduct from './pages/EditProduct';
import ImportExport from './pages/ImportExport';
import NoAccess from './pages/NoAccess';
import CreateTenant from './pages/CreateTenant';
import { OnboardingRouter } from './components/OnboardingRouter';

function Navigation({ user, onLogout }: { user: User; onLogout: () => void }) {
  const location = useLocation();
  const { currentTenant } = useTenant();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/products', label: 'מוצרים' },
    { path: '/suppliers', label: 'ספקים' },
    { path: '/categories', label: 'קטגוריות' },
    { path: '/import-export', label: 'ייבוא/ייצוא' },
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-background to-muted">
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
  if (!user) {
    return (
      <div className="min-h-screen">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    );
  }

  return (
    <OnboardingRouter>
      <AppWithNavigation user={user} onLogout={onLogout} />
    </OnboardingRouter>
  );
}

function AppWithNavigation({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { currentTenant } = useTenant();
  
  // Only show navigation if we have a tenant
  if (!currentTenant) {
    return null;
  }

  return (
    <div className="min-h-screen">
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
