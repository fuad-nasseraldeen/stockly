import { Link, useLocation } from 'react-router-dom';
import { Package, Settings as SettingsIcon, Tags, Truck } from 'lucide-react';

const tabs: Array<{ path: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { path: '/products', label: 'מוצרים', icon: Package },
  { path: '/suppliers', label: 'ספקים', icon: Truck },
  { path: '/categories', label: 'קטגוריות', icon: Tags },
  { path: '/settings', label: 'הגדרות', icon: SettingsIcon },
];

export function BottomTabs() {
  const location = useLocation();

  const isTabActive = (path: string) =>
    path === '/products'
      ? location.pathname === '/products' || location.pathname.startsWith('/products/')
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-8 z-40 px-3 pb-2 sm:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
      aria-label="ניווט תחתון"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-white/0 via-white/45 to-white/70 dark:from-slate-950/0 dark:via-slate-950/45 dark:to-slate-950/70"
      />

      <div className="pointer-events-auto relative z-10 mx-auto max-w-md">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-border/70 bg-background/95 shadow-[0_-10px_20px_-12px_rgb(15_23_42/0.55),0_8px_14px_-12px_rgb(15_23_42/0.22)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border border-border/70 bg-background/95 shadow-[0_-10px_20px_-12px_rgb(15_23_42/0.55),0_8px_14px_-12px_rgb(15_23_42/0.22)]"
        />

        <div className="relative grid h-16 grid-cols-5 items-center rounded-[999px] border border-border/70 bg-background/95 px-2 backdrop-blur transition-shadow duration-200 shadow-[0_-14px_26px_-16px_rgb(15_23_42/0.58),0_14px_24px_-18px_rgb(15_23_42/0.22)]">
          {tabs.slice(0, 2).map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded-[999px] text-[11px] font-medium transition-all duration-200 ${
                  active
                    ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgb(59_130_246/0.25)]'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
              >
                <Icon className="mb-1 h-4 w-4" />
                <span className="leading-none">{tab.label}</span>
              </Link>
            );
          })}

          <div aria-hidden />

          {tabs.slice(2).map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex min-h-[44px] flex-col items-center justify-center rounded-[999px] text-[11px] font-medium transition-all duration-200 ${
                  active
                    ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgb(59_130_246/0.25)]'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
              >
                <Icon className="mb-1 h-4 w-4" />
                <span className="leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
