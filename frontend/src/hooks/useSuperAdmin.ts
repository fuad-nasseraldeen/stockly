import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';
import { supabase } from '../lib/supabase';

/**
 * useSuperAdmin hook
 * 
 * CRITICAL SECURITY: This hook is user-specific and does NOT leak across users.
 * - Gets current user email (supabase.auth.getUser)
 * - If email !== 'fuad@owner.com', returns false immediately WITHOUT calling API
 * - queryKey includes user email: ['super-admin', email] to prevent cache leaks
 * - Only enabled when route is /admin to avoid unnecessary checks
 * 
 * This ensures:
 * - Normal users never see admin UI
 * - Switching users never keeps admin UI true from cache
 * - No unnecessary API calls for non-admin users
 */
/**
 * useSuperAdmin hook
 * 
 * CRITICAL SECURITY: This hook is user-specific and does NOT leak across users.
 * - Gets current user email (supabase.auth.getUser)
 * - If email !== 'fuad@owner.com', returns false immediately WITHOUT calling API
 * - queryKey includes user email: ['super-admin', email] to prevent cache leaks
 * - Only enabled when pathname === '/admin' to avoid unnecessary checks
 * 
 * This ensures:
 * - Normal users never see admin UI
 * - Switching users never keeps admin UI true from cache
 * - No unnecessary API calls for non-admin users
 */
export function useSuperAdmin(enabled = true) {
  const location = useLocation();
  const isAdminRoute = location.pathname === '/admin';
  const queryClient = useQueryClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Get user email once on mount/route change
  // CRITICAL: Only fetch email when on /admin route
  useEffect(() => {
    if (enabled && isAdminRoute) {
      supabase.auth.getUser().then(({ data }) => {
        const email = data?.user?.email?.toLowerCase() || null;
        setUserEmail(email);
        // Invalidate any old cache entries for different emails
        queryClient.removeQueries({ 
          queryKey: ['super-admin'], 
          exact: false 
        });
      });
    }
    // Note: We don't clear email when not on admin route to avoid cascading renders
    // The query will be disabled anyway when isAdminRoute is false
  }, [enabled, isAdminRoute, queryClient]);
  
  return useQuery({
    // CRITICAL: Include user email in queryKey to make it user-specific
    // This prevents cache leaks when switching users
    queryKey: ['super-admin', userEmail || 'unknown'],
    // CRITICAL: Only enabled when pathname === '/admin' and email is loaded
    enabled: enabled && isAdminRoute && userEmail !== null,
    queryFn: async () => {
      // CRITICAL: If email !== 'fuad@owner.com', return false immediately
      // DO NOT call adminApi.checkSuperAdmin() for non-admin users
      // This prevents 403 errors and unnecessary API calls
      if (userEmail !== 'fuad@owner.com') {
        return false;
      }

      // Only call API if email matches - this should always succeed for valid admin
      await adminApi.checkSuperAdmin();
      return true;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes - admin status is stable
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}
