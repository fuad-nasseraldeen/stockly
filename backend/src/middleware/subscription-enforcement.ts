import type { NextFunction, Request, Response } from 'express';
import { computeSubscriptionStatus, ensureTenantSubscription, shouldEnforceSubscriptionWrites } from '../lib/subscription.js';

export async function requireSubscriptionWriteAccess(req: Request, res: Response, next: NextFunction) {
  if (!shouldEnforceSubscriptionWrites()) {
    return next();
  }

  const tenant = (req as any).tenant as { tenantId: string } | undefined;
  if (!tenant?.tenantId) {
    return res.status(500).json({ error: 'שגיאת שרת: tenant context חסר' });
  }

  try {
    const sub = await ensureTenantSubscription(tenant.tenantId);
    const computed = computeSubscriptionStatus(sub);
    if (computed.status === 'expired' || computed.status === 'cancelled') {
      return res.status(403).json({
        error: 'תקופת הניסיון הסתיימה. כדי להמשיך לערוך נתונים יש לשדרג מנוי.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }
    return next();
  } catch (error) {
    console.error('[subscription-enforcement] failed:', error);
    return res.status(500).json({ error: 'שגיאה בבדיקת סטטוס מנוי' });
  }
}
