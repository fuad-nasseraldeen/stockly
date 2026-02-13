import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { Menu, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { TenantSwitcher } from '../TenantSwitcher';
import { useTenant } from '../../hooks/useTenant';

type AppHeaderProps = {
  user: User;
  onLogout: () => void;
  isSuperAdmin: boolean;
};

const navItems: Array<{ path: string; label: string }> = [
  { path: '/products', label: 'מוצרים' },
  { path: '/suppliers', label: 'ספקים' },
  { path: '/categories', label: 'קטגוריות' },
  { path: '/import-export', label: 'ייבוא' },
  { path: '/settings', label: 'הגדרות' },
];

export function AppHeader({ user, onLogout, isSuperAdmin }: AppHeaderProps) {
  const location = useLocation();
  const { currentTenant } = useTenant();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) =>
    path === '/products'
      ? location.pathname === '/products' || location.pathname.startsWith('/products/')
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="relative mx-auto max-w-6xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-border/70 bg-background/95 elevation-1"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-border/70 bg-background/95 elevation-1"
          />

          <div className="relative flex min-h-[64px] items-center justify-between gap-2 rounded-[999px] border border-border/70 bg-background/95 px-3 backdrop-blur transition-shadow duration-200 elevation-1 sm:px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <span className="text-sm font-bold">S</span>
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight text-foreground sm:text-lg">Stockly</h1>
                <p className="hidden text-[10px] leading-tight text-muted-foreground sm:block">
                  ניהול מחירים לפי ספק
                </p>
              </div>
            </div>

            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  asChild
                  variant="ghost"
                  size="sm"
                  className={isActive(item.path) ? 'bg-accent' : ''}
                >
                  <Link to={item.path} className="px-3 py-2 text-sm font-medium">
                    {item.label}
                  </Link>
                </Button>
              ))}
              {isSuperAdmin && (
                <Button asChild variant="ghost" size="sm" className={isActive('/admin') ? 'bg-accent' : ''}>
                  <Link to="/admin" className="px-3 py-2 text-sm font-medium">
                    ניהול מערכת
                  </Link>
                </Button>
              )}
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <TenantSwitcher />
              <span className="hidden max-w-[150px] truncate text-xs text-muted-foreground lg:inline">
                {user.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onLogout}
                className="hidden min-h-[44px] rounded-full px-4 text-xs sm:inline-flex"
              >
                יציאה
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px] rounded-full md:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="תפריט"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-[86vw] max-w-sm border-l border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <h2 className="text-lg font-bold">תפריט</h2>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px] rounded-full"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="סגור"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="flex h-[calc(100vh-72px)] flex-col overflow-y-auto p-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`min-h-[44px] rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                    isActive(item.path) ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              {isSuperAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`min-h-[44px] rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                    isActive('/admin') ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                  }`}
                >
                  ניהול מערכת
                </Link>
              )}

              <div className="my-2 border-t border-border" />
              <div className="space-y-2 px-4 py-2">
                {currentTenant && (
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs font-medium">{currentTenant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentTenant.role === 'owner' ? 'בעלים' : 'עובד'}
                    </p>
                  </div>
                )}
                <p className="break-all text-xs text-muted-foreground">{user.email}</p>
                <Button
                  variant="outline"
                  className="min-h-[44px] w-full rounded-full"
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
      </Dialog>
    </>
  );
}
