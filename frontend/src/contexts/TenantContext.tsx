import { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantsApi } from '../lib/api';

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

export const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);
  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => tenantsApi.list(),
  });
  console.log('🔍 TenantContext - useQuery result:', { tenants, isLoading });
  // Load tenant from localStorage on mount and update localStorage immediately when tenants load
  useEffect(() => {
    if (tenants.length > 0) {
      const saved = localStorage.getItem('currentTenantId');
      let selectedTenant: Tenant | null = null;
      
      if (saved) {
        const tenant = tenants.find(t => t.id === saved);
        if (tenant) {
          selectedTenant = tenant;
        } else {
          // If saved tenant not found, use first available
          selectedTenant = tenants[0];
        }
      } else {
        // No saved tenant, use first available
        selectedTenant = tenants[0];
      }
      
      // Update localStorage immediately (before state update to avoid race conditions)
      // This ensures getTenantId() returns the correct value even if requests are sent early
      if (selectedTenant) {
        console.log('🔍 TenantContext: Updating localStorage with tenantId:', selectedTenant.id);
        localStorage.setItem('currentTenantId', selectedTenant.id);
      }
      
      // Update state (this may trigger a render, but localStorage is already updated)
      if (selectedTenant) {
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

