import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';

type AuthedUser = {
  id: string;
  email?: string;
};

type TenantContext = {
  tenantId: string;
  role: 'owner' | 'worker';
};

declare global {
  // eslint-disable-next-line no-var
  var __stocklyAuthSupabase:
    | ReturnType<typeof createClient>
    | undefined;
}

function getAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('חסר SUPABASE_URL בקובץ .env של השרת');
  }
  if (!supabaseAnonKey) {
    throw new Error('חסר SUPABASE_ANON_KEY בקובץ .env של השרת');
  }

  if (!globalThis.__stocklyAuthSupabase) {
    globalThis.__stocklyAuthSupabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return globalThis.__stocklyAuthSupabase;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (!token) {
    return res.status(401).json({ error: 'נדרש להתחבר כדי לבצע פעולה זו' });
  }

  const authSupabase = getAuthClient();

  authSupabase.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) {
        return res.status(401).json({ error: 'ההתחברות פגה תוקף, נא להתחבר מחדש' });
      }

      (req as any).user = { id: data.user.id, email: data.user.email } as AuthedUser;
      (req as any).authToken = token; // Store token for service role operations
      next();
    })
    .catch(() => res.status(401).json({ error: 'שגיאת אימות, נסה שוב' }));
}

export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  const user = (req as any).user as AuthedUser | undefined;

  if (!user) {
    return res.status(401).json({ error: 'נדרש להתחבר' });
  }

  if (!tenantId) {
    return res.status(400).json({ error: 'נדרש x-tenant-id header' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return res.status(400).json({ error: 'x-tenant-id חייב להיות UUID תקין' });
  }

  // Check membership using service role (bypasses RLS)
  const { data: membership, error } = await supabase
    .from('memberships')
    .select('role, is_blocked')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !membership) {
    return res.status(403).json({ error: 'אין לך גישה לטננט זה' });
  }

  // Check if user is blocked
  if (membership.is_blocked) {
    return res.status(403).json({ error: 'חשבונך נחסם בטננט זה. נא ליצור קשר עם בעל החנות.' });
  }

  (req as any).tenant = {
    tenantId,
    role: membership.role as 'owner' | 'worker',
  } as TenantContext;

  next();
}

export function ownerOnly(req: Request, res: Response, next: NextFunction) {
  const tenant = (req as any).tenant as TenantContext | undefined;

  if (!tenant) {
    return res.status(500).json({ error: 'שגיאת שרת: tenant context חסר' });
  }

  if (tenant.role !== 'owner') {
    return res.status(403).json({ error: 'פעולה זו זמינה לבעלים בלבד' });
  }

  next();
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthedUser | undefined;

  if (!user) {
    return res.status(401).json({ error: 'נדרש להתחבר' });
  }

  // Check if user is super admin
  // Using service role client to bypass RLS
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_super_admin, user_id')
    .eq('user_id', user.id)
    .single();

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('Super Admin Check:', {
      user_id: user.id,
      user_email: user.email,
      profile: profile,
      error: error,
      is_super_admin: profile?.is_super_admin,
    });
  }

  if (error) {
    console.error('Error checking super admin:', error);
    return res.status(403).json({ error: 'שגיאה בבדיקת הרשאות מנהל' });
  }

  if (!profile || !profile.is_super_admin) {
    return res.status(403).json({ error: 'פעולה זו זמינה למנהל המערכת בלבד' });
  }

  next();
}
