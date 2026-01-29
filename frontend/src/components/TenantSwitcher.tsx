import { useState } from 'react';
import { useTenant } from '../hooks/useTenant';
import { Button } from './ui/button';
import { ChevronDown, Building2 } from 'lucide-react';

export function TenantSwitcher() {
  const { currentTenant, tenants, setCurrentTenant } = useTenant();
  const [open, setOpen] = useState(false);

  if (tenants.length === 0) return null;
  if (tenants.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4" />
        <span className="truncate max-w-[150px]">{currentTenant?.name || tenants[0].name}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-2"
      >
        <Building2 className="w-4 h-4" />
        <span className="truncate max-w-[120px] hidden sm:inline">{currentTenant?.name || 'בחר טננט'}</span>
        <ChevronDown className="w-4 h-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-48 bg-background border-2 border-border rounded-lg shadow-lg z-50">
            <div className="p-2">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => {
                    setCurrentTenant(tenant);
                    setOpen(false);
                  }}
                  className={`w-full text-right px-3 py-2 rounded-md text-sm transition-colors ${
                    currentTenant?.id === tenant.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="font-medium">{tenant.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {tenant.role === 'owner' ? 'בעלים' : 'עובד'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
