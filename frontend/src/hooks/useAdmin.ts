import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, subscriptionApi } from '../lib/api';
import { useTenant } from './useTenant';

export function useAdminTenants() {
  return useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => {
      console.log('🔍 useAdminTenants: Starting fetch...');
      try {
        const result = await adminApi.getTenants();
        console.log('🔍 useAdminTenants: Success:', result);
        return result;
      } catch (error) {
        console.error('🔍 useAdminTenants: Error:', error);
        const err = error as { message?: string; status?: number; response?: unknown };
        console.error('🔍 useAdminTenants: Error details:', {
          message: err?.message,
          status: err?.status,
          response: err?.response,
        });
        throw error;
      }
    },
  });
}

export function useAuditLogs(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: () => adminApi.getAuditLogs(params),
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.blockUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.unblockUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useRemoveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.removeUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useResetTenantData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.resetTenantData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useDeleteTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.deleteTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export function useAdminImpersonate() {
  return useMutation({
    mutationFn: adminApi.impersonate,
  });
}

export function useAdminSubscriptions() {
  return useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () => adminApi.getSubscriptions(),
  });
}

export function useUpdateAdminSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, patch }: { tenantId: string; patch: Parameters<typeof adminApi.updateSubscription>[1] }) =>
      adminApi.updateSubscription(tenantId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  });
}

export function useExtendAdminSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, payload }: { tenantId: string; payload: { months?: number; valid_until?: string } }) =>
      adminApi.extendSubscription(tenantId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  });
}

export function useSendAdminSubscriptionReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => adminApi.sendSubscriptionReminder(tenantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  });
}

export function useTenantSubscriptionStatus() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  return useQuery({
    queryKey: ['tenant', 'subscription-status', tenantId],
    queryFn: () => subscriptionApi.getStatus(),
    enabled: !!tenantId,
  });
}
