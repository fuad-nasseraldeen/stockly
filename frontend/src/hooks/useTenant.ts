import { useContext } from 'react';
import { TenantContext, type TenantContextType } from '../contexts/TenantContext';

export function useTenant(): TenantContextType {
  const context = useContext(TenantContext);
  if (context === undefined) {
    // Return a safe default instead of throwing, to prevent crashes during initial render
    console.warn('useTenant called outside TenantProvider, returning default values');
    return {
      currentTenant: null,
      tenants: [],
      isLoading: true,
      setCurrentTenant: () => {},
      refetchTenants: async () => {},
    };
  }
  return context;
}
