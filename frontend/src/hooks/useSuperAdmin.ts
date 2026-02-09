import { useQuery } from '@tanstack/react-query';
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
  // Treat both /admin and /onboarding as "admin context" so we can:
  // - Guard the /admin route itself
  // - Show the super admin option on the onboarding screen
  const isAdminContext = location.pathname === '/admin' || location.pathname === '/onboarding';
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Get user email once on mount/route change
  // CRITICAL: Only fetch email when in admin context (/admin or /onboarding)
  useEffect(() => {
    if (!enabled || !isAdminContext) return;

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      const email = data?.user?.email?.toLowerCase() || null;
      setUserEmail(email);
    });

    return () => {
      isMounted = false;
    };
    // Note: We don't clear email when not in admin context to avoid cascading renders
    // The query will be disabled anyway when isAdminContext is false
  }, [enabled, isAdminContext]);
  
  return useQuery({
    // CRITICAL: Include user email in queryKey to make it user-specific
    // This prevents cache leaks when switching users
    queryKey: ['super-admin', userEmail || 'unknown'],
    // CRITICAL: Only enabled when in admin context and email is loaded
    enabled: enabled && isAdminContext && userEmail !== null,
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
