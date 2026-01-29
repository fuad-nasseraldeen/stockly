import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/api';

export function useSuperAdmin() {
  return useQuery({
    queryKey: ['super-admin', 'check'],
    queryFn: async () => {
      try {
        await adminApi.checkSuperAdmin();
        return true;
      } catch (error) {
        // Log error in development for debugging
        if (process.env.NODE_ENV === 'development') {
          console.error('Super Admin check failed:', error);
        }
        return false;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
