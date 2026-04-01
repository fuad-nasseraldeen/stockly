import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stockApi } from '../lib/api';
import { useSettings } from './useSettings';

export function useProductStock(productId: string | undefined) {
  const { data: settings } = useSettings();
  const enabledFlag = settings?.stock_tracking_enabled === true;
  return useQuery({
    queryKey: ['stock', 'product', productId],
    queryFn: () => stockApi.getForProduct(productId!),
    enabled: !!productId && enabledFlag,
  });
}

export function useUpdateProductStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stockApi.update,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['stock', 'product', vars.productId] });
      queryClient.invalidateQueries({ queryKey: ['stock', 'low'] });
    },
  });
}

export function useLowStockList(args: { q?: string; critical?: boolean; enabled?: boolean }) {
  const { q = '', critical = false, enabled = true } = args;
  const { data: settings } = useSettings();
  const flag = settings?.stock_tracking_enabled === true;
  return useQuery({
    queryKey: ['stock', 'low', q, critical],
    queryFn: () => stockApi.listLow({ q, critical }),
    enabled: enabled && flag,
  });
}
