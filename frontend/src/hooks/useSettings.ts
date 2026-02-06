import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type Settings } from '../lib/api';
import { useTenant } from './useTenant';

/**
 * useSettings hook
 * 
 * CRITICAL: This hook relies on bootstrap cache. After bootstrap resolves,
 * settings data is seeded in cache with key ['settings', tenantId].
 * This hook will use cached data and NOT make a separate API call on initial load.
 * 
 * Only makes API call if:
 * - Cache is stale (after 10 minutes)
 * - Cache is invalidated (after mutation)
 * - Bootstrap did not run or failed
 * 
 * CRITICAL: TenantContext is the ONLY source of truth for tenantId.
 * Uses only currentTenant?.id to ensure query keys match bootstrap cache exactly.
 * 
 * Uses initialData from cache to prevent refetch on initial boot when bootstrap seeded cache.
 */
export function useSettings() {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  
  // CRITICAL: TenantContext is the ONLY source of truth for tenantId
  // Do NOT read from localStorage - use only currentTenant?.id
  const tenantId = currentTenant?.id;
  
  // Get data from cache (seeded by bootstrap)
  const queryKey = ['settings', tenantId] as const;
  const cachedData = queryClient.getQueryData<Settings>(queryKey);
  
  // Check if bootstrap is still loading
  const bootstrapQueryKey = ['bootstrap', tenantId] as const;
  const bootstrapState = queryClient.getQueryState(bootstrapQueryKey);
  const isBootstrapFinished = bootstrapState?.status === 'success' || bootstrapState?.status === 'error';
  
  return useQuery({
    queryKey,
    queryFn: () => settingsApi.get(),
    // CRITICAL: Use placeholderData instead of initialData
    // placeholderData doesn't trigger refetch if data exists in cache
    placeholderData: cachedData,
    // CRITICAL: Don't fetch if bootstrap is still loading (wait for it to finish)
    // If bootstrap finished (success or error), allow fetch if no cached data
    // If we have cached data, React Query will use it (via placeholderData) and won't fetch
    // This prevents race condition where hooks fetch before bootstrap finishes
    enabled: !!tenantId && (isBootstrapFinished || !bootstrapState),
    // CRITICAL: Long staleTime ensures we use bootstrap cache on initial load
    staleTime: 10 * 60 * 1000, // 10 minutes - settings are stable
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on mount if data exists in cache
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
