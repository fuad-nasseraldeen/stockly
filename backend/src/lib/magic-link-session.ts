import { supabase } from './supabase.js';
import { supabaseAuthClient } from './supabase-auth-client.js';

/**
 * Create a Supabase session for an existing user via Admin generateLink + verifyOtp.
 * Used by auth routes and super-admin impersonation.
 */
export async function createSessionForEmail(email: string): Promise<{ session: any; user: any }> {
  const adminApi = supabase.auth.admin as any;
  const authApi = supabaseAuthClient.auth as any;

  const { data: linkData, error: linkError } = await adminApi.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) {
    throw new Error(linkError.message || 'failed to create login link');
  }

  const emailOtp = linkData?.properties?.email_otp;
  if (!emailOtp) {
    throw new Error('missing email otp from generated link');
  }

  const { data, error } = await authApi.verifyOtp({
    email,
    token: emailOtp,
    type: 'email',
  });

  if (error || !data?.session || !data?.user) {
    throw new Error(error?.message || 'failed to create session for existing user');
  }

  return { session: data.session, user: data.user };
}
