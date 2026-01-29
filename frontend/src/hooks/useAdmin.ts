import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../lib/api';

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
