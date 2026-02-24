import { createClient, SupabaseClient } from '@supabase/supabase-js';

let authClient: SupabaseClient | null = null;

function getSupabaseAuthClient(): SupabaseClient {
  if (!authClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is required in environment variables');
    }

    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY is required in environment variables');
    }

    authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return authClient;
}

export const supabaseAuthClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseAuthClient()[prop as keyof SupabaseClient];
  },
});
