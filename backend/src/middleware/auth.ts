import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { verifyAccessToken } from '../lib/jwt.js';

export type AuthedUser = {
  id: string;
  email?: string;
};

export type TenantContext = {
  tenantId: string;
  role: 'owner' | 'worker';
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (!token) {
    return res.status(401).json({ error: 'נדרש להתחבר כדי לבצע פעולה זו' });
  }

  const verifiedToken = await verifyAccessToken(token);
  if (!verifiedToken) {
    return res.status(401).json({ error: 'ההתחברות פגה תוקף, נא להתחבר מחדש' });
  }

  (req as any).user = { id: verifiedToken.sub, email: verifiedToken.email } as AuthedUser;
  (req as any).authToken = token; // Store token for service role operations
  next();
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
