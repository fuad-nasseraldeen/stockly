import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import {
  Menu,
  X,
  Sun,
  Moon,
  LayoutDashboard,
  Package,
  Truck,
  Boxes,
  BarChart3,
  Upload,
  MessageCircleMore,
  Settings,
  BellRing,
  CreditCard,
} from 'lucide-react';
import { Button } from '../ui/button';
import { TenantSwitcher } from '../TenantSwitcher';
import { useTenant } from '../../hooks/useTenant';
import { useSettings } from '../../hooks/useSettings';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import { StocklyMark } from './StocklyMark';

type AppHeaderProps = {
  user: User;
  onLogout: () => void;
  isSuperAdmin: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  adminOnlyMode?: boolean;
};

const BASE_NAV: Array<{ path: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { path: '/dashboard', label: 'בית', icon: LayoutDashboard },
  { path: '/products', label: 'מוצרים', icon: Package },
  { path: '/suppliers', label: 'ספקים', icon: Truck },
  { path: '/categories', label: 'קטגוריות', icon: Boxes },
  { path: '/compare', label: 'השוואת מחירים', icon: BarChart3 },
  { path: '/import-export', label: 'ייבוא', icon: Upload },
  { path: '/support', label: 'תמיכה', icon: MessageCircleMore },
  { path: '/subscription', label: 'מנוי וחיובים', icon: CreditCard },
  { path: '/settings', label: 'הגדרות', icon: Settings },
];

const isOnSettings = (pathname: string) =>
  pathname === '/settings' || pathname.startsWith('/settings/');

export function AppHeader({ user, onLogout, isSuperAdmin, isDark, onToggleTheme, adminOnlyMode = false }: AppHeaderProps) {
  const location = useLocation();
  const { currentTenant } = useTenant();
  const { data: headerSettings } = useSettings();
  const { hasUnsavedChanges, requestNavigation } = useUnsavedChanges();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = useMemo(() => {
    const items = [...BASE_NAV];
    if (headerSettings?.stock_tracking_enabled === true) {
      const insertAt = 3;
      items.splice(insertAt, 0, { path: '/stock-alerts', label: 'התראות מלאי', icon: BellRing });
    }
    return items;
  }, [headerSettings?.stock_tracking_enabled]);

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    if (isOnSettings(location.pathname) && hasUnsavedChanges && path !== '/settings') {
      e.preventDefault();
      requestNavigation(path);
    }
  };

  const isActive = (path: string) =>
    path === '/dashboard'
      ? location.pathname === '/dashboard' || location.pathname === '/'
      : path === '/products'
      ? location.pathname === '/products' || location.pathname.startsWith('/products/')
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <>
      <header className="sticky top-0 z-40 ">
        <div className="relative">
          <div className="relative flex min-h-[64px] items-center justify-between gap-2 bg-background/95 px-3 backdrop-blur transition-shadow duration-200 elevation-1 sm:px-4">
            <div className="flex items-center gap-2">
              <Button
                variant="bare"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="תפריט"
              >
                <Menu className="h-6 w-6" />
              </Button>
              <StocklyMark size={40} className="rounded-sm shadow-none" />
              <div>
                <h1 className="text-base font-bold leading-tight text-foreground sm:text-lg">
                  {currentTenant?.name || 'Stockly'}
                </h1>
                <p className="hidden text-[10px] leading-tight text-muted-foreground sm:block">ניהול מערכת</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* <Button
                variant="outline"
                size="sm"
                onClick={onLogout}
                className="min-h-[44px] rounded-sm px-2 text-xs sm:px-3"
              >
                יציאה
              </Button> */}
              <span className="hidden max-w-[150px] truncate text-xs text-muted-foreground lg:inline">
                {user.email}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-[60] transition-opacity duration-400 ease-out ${
          mobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!mobileMenuOpen}
      >
        <div
          className="fixed inset-0 bg-black/40 transition-opacity duration-400 ease-out"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div
          className={`fixed right-0 top-2 h-[calc(100%-8px)] w-[82vw] max-w-[340px] border-l border-border bg-background shadow-xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <h2 className="text-lg font-bold">תפריט</h2>
              <Button
                variant="bare"
                size="icon"
                className="min-h-[44px] min-w-[44px] rounded-sm"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="סגור"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="flex h-[calc(100vh-72px)] flex-col overflow-y-auto p-2">
              {!adminOnlyMode && navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={(e) => {
                      handleNavClick(e, item.path);
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[44px] rounded-sm px-4 py-3 text-base font-medium transition-colors ${
                      isActive(item.path) ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>{item.label}</span>
                      <Icon className="h-4 w-4 shrink-0" />
                    </span>
                  </Link>
                );
              })}

              {isSuperAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`min-h-[44px] rounded-sm px-4 py-3 text-base font-medium transition-colors ${
                    isActive('/admin') ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  ניהול מערכת
                </Link>
              )}

              <div className="my-2 border-t border-border" />
              <div className="space-y-2 px-4 py-2">
                {!adminOnlyMode && <TenantSwitcher />}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-[44px] rounded-sm justify-center gap-2"
                  onClick={onToggleTheme}
                  aria-label={isDark ? 'מעבר למצב יום' : 'מעבר למצב לילה'}
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {isDark ? 'מצב יום' : 'מצב לילה'}
                </Button>
                {!adminOnlyMode && currentTenant && (
                  <div className="rounded-sm bg-muted p-2">
                    <p className="text-xs font-medium">{currentTenant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentTenant.role === 'owner' ? 'בעלים' : 'עובד'}
                    </p>
                  </div>
                )}
                <p className="break-all text-xs text-muted-foreground">{user.email}</p>
                <Button
                  variant="outline"
                  className="min-h-[44px] w-full rounded-sm"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                >
                  יציאה
                </Button>
              </div>
            </nav>
        </div>
      </div>
    </>
  );
}
