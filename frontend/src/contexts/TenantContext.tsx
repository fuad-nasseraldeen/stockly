import { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi, setTenantIdForApi } from '../lib/api';
import { useAuthSession } from '../hooks/useAuthSession';
import { supabase } from '../lib/supabase';

// Simple flag to turn perf logs on/off without external libs
const DEBUG_PERF = import.meta.env.DEV && false;

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
  const queryClient = useQueryClient();
  const userId = useAuthSession(); // Get current user ID from session
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);
  
  // CRITICAL: Tenants query runs ONLY when user session exists
  // queryKey includes userId to prevent cross-user cache leaks
  const { data: tenants = [], isLoading, refetch } = useQuery<Tenant[], Error>({
    queryKey: ['tenants', userId],
    // Wrap tenants fetch with console.time for lightweight instrumentation
    queryFn: async (): Promise<Tenant[]> => {
      if (DEBUG_PERF) console.time('tenants:fetch');
      try {
        return await tenantsApi.list();
      } finally {
        if (DEBUG_PERF) console.timeEnd('tenants:fetch');
      }
    },
    // Only fetch when user session exists
    enabled: !!userId,
    // Tenants are relatively stable; avoid re-fetching on every mount.
    // This improves post-login performance when revisiting the app.
    staleTime: 5 * 60 * 1000, // >= 60s as requested
    refetchOnWindowFocus: false,
    retry: 1,
  });
  
  // CRITICAL: Listen to auth state changes to handle SIGNED_OUT and SIGNED_IN events
  // This prevents cross-user tenant leakage
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id || null;

      if (event === 'SIGNED_OUT') {
        // User signed out - clear everything to prevent data leakage
        setCurrentTenantState(null);
        setTenantIdForApi(null);
        localStorage.removeItem('currentTenantId');
        // Clear React Query cache for tenant-scoped data to prevent leakage
        // Using partial queryKey matches all queries that start with these keys
        queryClient.removeQueries({ queryKey: ['tenants'] });
        queryClient.removeQueries({ queryKey: ['settings'] }); // This also removes ['settings', 'preferences', ...]
        queryClient.removeQueries({ queryKey: ['categories'] });
        queryClient.removeQueries({ queryKey: ['suppliers'] });
        queryClient.removeQueries({ queryKey: ['products'] });
        queryClient.removeQueries({ queryKey: ['bootstrap'] });
      } else if (event === 'SIGNED_IN' && newUserId) {
        // User signed in - invalidate tenants query to refetch fresh data for this user
        // This ensures we don't reuse cached tenants from a previous user
        queryClient.invalidateQueries({ queryKey: ['tenants', newUserId] });
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);
  
  // Load tenant from localStorage on mount and update module-level variable when tenants load
  // CRITICAL: Validate stored tenantId against fetched tenants list to prevent 403 errors
  // Note: setState in effect is necessary here to sync tenant selection with fetched tenants list.
  // This is a legitimate use case as we need to react to external data (tenants) loading.
  useEffect(() => {
    if (tenants.length > 0) {
      const saved = localStorage.getItem('currentTenantId');
      let selectedTenant: Tenant | null = null;

      if (saved) {
        // Validate: check if saved tenantId exists in fetched tenants list
        const tenant = tenants.find((t) => t.id === saved);
        if (tenant) {
          // Valid tenantId - use it
          selectedTenant = tenant;
        } else {
          // Invalid tenantId - remove it from localStorage and use first available
          console.warn(`Invalid tenantId "${saved}" found in localStorage, removing it`);
          localStorage.removeItem('currentTenantId');
          selectedTenant = tenants[0];
        }
      } else {
        // No saved tenant, use first available
        selectedTenant = tenants[0];
      }

      // CRITICAL: Update module-level variable FIRST (before state update)
      // This ensures apiRequest() uses the correct tenantId even if requests are sent early
      if (selectedTenant) {
        setTenantIdForApi(selectedTenant.id);
        localStorage.setItem('currentTenantId', selectedTenant.id);
      } else {
        setTenantIdForApi(null);
        localStorage.removeItem('currentTenantId');
      }

      // Update state only if tenant selection changed to minimize renders
      if (selectedTenant && selectedTenant.id !== currentTenant?.id) {
        setCurrentTenantState(selectedTenant);
      }
    } else if (tenants.length === 0 && !isLoading && currentTenant) {
      // No tenants available - clear currentTenant, module variable, and localStorage
      setCurrentTenantState(null);
      setTenantIdForApi(null);
      localStorage.removeItem('currentTenantId');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants, isLoading]); // Intentionally exclude currentTenant to avoid infinite loop

  const setCurrentTenant = useCallback((tenant: Tenant | null) => {
    if (tenant) {
      // Validate tenant exists in tenants list before setting
      const isValid = tenants.some((t) => t.id === tenant.id);
      if (isValid) {
        // CRITICAL: Update module-level variable FIRST (before state update)
        // This ensures apiRequest() uses the correct tenantId immediately
        setTenantIdForApi(tenant.id);
        localStorage.setItem('currentTenantId', tenant.id);
        setCurrentTenantState(tenant);
      } else {
        console.warn(`Attempted to set invalid tenant "${tenant.id}", clearing`);
        setTenantIdForApi(null);
        localStorage.removeItem('currentTenantId');
        setCurrentTenantState(null);
      }
    } else {
      // CRITICAL: Update module-level variable FIRST (before state update)
      setTenantIdForApi(null);
      localStorage.removeItem('currentTenantId');
      setCurrentTenantState(null);
    }
  }, [tenants]);

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

