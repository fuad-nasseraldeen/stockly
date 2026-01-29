import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/api';

export function useSuperAdmin() {
  return useQuery({
    queryKey: ['super-admin', 'check'],
    queryFn: async () => {
      console.log('🔍 useSuperAdmin: Starting check...');
      try {
        const result = await adminApi.checkSuperAdmin();
        console.log('🔍 useSuperAdmin: API call succeeded:', result);
        return true;
      } catch (error: any) {
        // Log error in development for debugging
        console.error('🔍 useSuperAdmin: API call failed:', error);
        console.error('🔍 useSuperAdmin: Error details:', {
          message: error?.message,
          status: error?.status,
          response: error?.response,
        });
        return false;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
