import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from './useTenant';
import { ColumnLayout } from '../lib/column-resolver';
import type { LayoutKey } from '../lib/column-layout-storage';
import { getTableLayoutProductsKey, getTableLayoutPriceHistoryKey } from '../lib/table-layout-keys';

function getPreferenceKey(layoutKey: LayoutKey): string {
  const PREFERENCE_KEY_PREFIX = 'table_layout_';
  return `${PREFERENCE_KEY_PREFIX}${layoutKey}`;
}

/**
 * useTableLayout hook
 * 
 * Loads table layout preference from React Query cache (seeded by bootstrap) or database.
 * 
 * CRITICAL: This hook uses React Query cache, so it will use bootstrap data if available.
 * No separate API call is made during boot - layout comes only through bootstrap.
 * 
 * CRITICAL: TenantContext is the ONLY source of truth for tenantId.
 * Uses only currentTenant?.id to ensure query keys match bootstrap cache exactly.
 * 
 * Uses canonical query keys defined in table-layout-keys.ts to ensure consistency.
 * 
 * SAFETY RULE: No request to /api/settings/preferences/* is sent unless tenantId exists.
 * 
 * @param layoutKey - The layout key (e.g., 'productsTable', 'priceHistoryTable')
 */
export function useTableLayout(layoutKey: LayoutKey = 'productsTable') {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const preferenceKey = getPreferenceKey(layoutKey);
  
  // CRITICAL: TenantContext is the ONLY source of truth for tenantId
  // Do NOT read from localStorage - use only currentTenant?.id
  const tenantId = currentTenant?.id;
  
  // Get canonical query key - MUST use canonical key for consistency
  const queryKey = (() => {
    if (!tenantId) return null;
    if (layoutKey === 'productsTable') {
      return getTableLayoutProductsKey(tenantId);
    } else if (layoutKey === 'priceHistoryTable') {
      return getTableLayoutPriceHistoryKey(tenantId);
    }
    return null;
  })();
  
  // Get data from cache (seeded by bootstrap)
  const cachedData = queryKey ? queryClient.getQueryData<Partial<ColumnLayout> | null>(queryKey) : undefined;
  
  // Check if bootstrap is still loading
  const bootstrapQueryKey = ['bootstrap', tenantId] as const;
  const bootstrapState = queryClient.getQueryState(bootstrapQueryKey);
  const isBootstrapFinished = bootstrapState?.status === 'success' || bootstrapState?.status === 'error';

  return useQuery<Partial<ColumnLayout> | null>({
    // CRITICAL: Use ONLY canonical query key - no fallback to ensure consistency
    // We never hit the API here; layout is loaded via bootstrap and updated via saveLayout()
    queryKey: queryKey || ['settings', 'preferences', preferenceKey, tenantId],
    queryFn: async () => {
      // No network calls here – just resolve whatever is already in cache
      return cachedData ?? null;
    },
    placeholderData: cachedData,
    // Only run once tenantId exists and bootstrap finished (or not started)
    enabled: !!tenantId && (isBootstrapFinished || !bootstrapState),
    // Long staleTime, no automatic refetches
    staleTime: 10 * 60 * 1000, // 10 minutes - layout is stable
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
