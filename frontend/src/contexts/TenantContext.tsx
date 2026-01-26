import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantsApi } from '../lib/api';

export type Tenant = {
  id: string;
  name: string;
  role: 'owner' | 'worker';
  created_at: string;
};

type TenantContextType = {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  isLoading: boolean;
  setCurrentTenant: (tenant: Tenant | null) => void;
  refetchTenants: () => void;
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);
  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => tenantsApi.list(),
  });

  // Load tenant from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('currentTenantId');
    if (saved && tenants.length > 0) {
      const tenant = tenants.find(t => t.id === saved);
      if (tenant) {
        setCurrentTenantState(tenant);
      } else if (tenants.length > 0) {
        // If saved tenant not found, use first available
        setCurrentTenantState(tenants[0]);
      }
    } else if (tenants.length > 0) {
      setCurrentTenantState(tenants[0]);
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

  const refetchTenants = useCallback(() => {
    return refetch();
  }, [refetch]);

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        tenants,
        isLoading,
        setCurrentTenant,
        refetchTenants,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
