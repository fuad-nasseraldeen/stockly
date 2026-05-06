import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { computeSubscriptionStatus, ensureTenantSubscription } from '../lib/subscription.js';

const router = Router();

router.get('/status', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant as { tenantId: string };
  try {
    const row = await ensureTenantSubscription(tenant.tenantId);
    const computed = computeSubscriptionStatus(row);
    return res.json({
      ...row,
      computed_status: computed.status,
      daysRemaining: computed.daysRemaining,
      isExpiringSoon: computed.isExpiringSoon,
    });
  } catch (error) {
    console.error('[subscription status] failed', error);
    return res.status(500).json({ error: 'שגיאה בטעינת סטטוס מנוי' });
  }
});

export default router;
