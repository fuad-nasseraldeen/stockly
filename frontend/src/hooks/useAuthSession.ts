import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useAuthSession hook
 * 
 * Provides current user session information.
 * Listens to auth state changes to detect sign in/out events.
 * 
 * @returns userId - The current user ID, or null if no session exists
 */
export function useAuthSession() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });

    // Listen for auth state changes (sign in/out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return userId;
}
