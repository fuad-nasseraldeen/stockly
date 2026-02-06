import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { bootstrapApi } from '../lib/api';
import { useTenant } from './useTenant';
import { getTableLayoutProductsKey } from '../lib/table-layout-keys';

/**
 * useBootstrap hook
 * 
 * Fetches all essential app data in a single request and seeds React Query cache
 * so that existing hooks (useSettings, useCategories, useSuppliers, useTableLayout) 
 * can use cached data instantly WITHOUT making separate API calls.
 * 
 * CRITICAL: After bootstrap resolves, it seeds cache with EXACT query keys that
 * the existing hooks use. This ensures hooks use cache and do NOT refetch on initial load.
 * 
 * Query keys seeded (must match hooks exactly):
 * - ['tenants'] - for TenantContext
 * - ['settings', tenantId] - for useSettings hook
 * - ['suppliers', tenantId] - for useSuppliers hook
 * - ['categories', tenantId] - for useCategories hook
 * - getTableLayoutProductsKey(tenantId) - for useTableLayout hook (canonical key)
 * 
 * CRITICAL: TenantContext is the ONLY source of truth for tenantId.
 * Bootstrap runs ONLY after tenantId is known from TenantContext.
 * This prevents duplicate bootstrap requests and ensures cache keys match exactly.
 */
export function useBootstrap(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  
  // CRITICAL: TenantContext is the ONLY source of truth for tenantId
  // Do NOT read from localStorage - use only currentTenant?.id
  const tenantId = currentTenant?.id;
  
  // Use useMemo to ensure stable queryKey across renders (prevents duplicate requests in StrictMode)
  const queryKey = useMemo(() => ['bootstrap', tenantId] as const, [tenantId]);

  return useQuery({
    // CRITICAL: Stable query key with tenantId ensures React Query deduplicates requests
    // Even in React StrictMode (dev), identical queryKey requests are deduped
    queryKey,
    queryFn: async () => {
      const data = await bootstrapApi.get();

      // CRITICAL: Seed React Query cache with EXACT query keys that hooks use
      // This ensures hooks find cached data and do NOT make separate API calls
      // Use tenantId (from TenantContext) to ensure keys match exactly

      // 1. Seed tenants cache (for TenantContext)
      if (data.tenants && data.tenants.length > 0) {
        queryClient.setQueryData(['tenants'], data.tenants);
      }

      // 2. Seed settings cache - EXACT key ['settings', tenantId] matches useSettings hook
      if (data.settings && tenantId) {
        queryClient.setQueryData(['settings', tenantId], data.settings);
      }

      // 3. Seed suppliers cache - EXACT key ['suppliers', tenantId] matches useSuppliers hook
      if (data.suppliers && tenantId) {
        queryClient.setQueryData(['suppliers', tenantId], data.suppliers);
      }

      // 4. Seed categories cache - EXACT key ['categories', tenantId] matches useCategories hook
      if (data.categories && tenantId) {
        queryClient.setQueryData(['categories', tenantId], data.categories);
      }

      // 5. Seed table layout cache - EXACT canonical key matches useTableLayout hook
      // CRITICAL: This prevents separate API calls during boot - layout comes only through bootstrap
      if (data.tableLayoutProducts !== null && tenantId) {
        queryClient.setQueryData(
          getTableLayoutProductsKey(tenantId),
          data.tableLayoutProducts
        );
      }

      return data;
    },
    // CRITICAL: Only run when tenantId is known from TenantContext
    // Bootstrap runs ONLY after tenantId is available
    enabled: enabled && !!tenantId,
    staleTime: 10 * 60 * 1000, // 10 minutes - bootstrap data is stable
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on mount if data exists in cache
    // Keep in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
  });
}
