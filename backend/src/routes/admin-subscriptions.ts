import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { computeSubscriptionStatus, ensureTenantSubscription, SUBSCRIPTION_STATUSES } from '../lib/subscription.js';
import { runDailySubscriptionReminders, sendSubscriptionReminderForTenant } from '../services/subscription-reminders.js';

const router = Router();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך חייב להיות בפורמט YYYY-MM-DD');
const PLAN_NAMES = ['trial_free', 'monthly_199', 'annual_49', 'basic', 'pro', 'business', 'enterprise'] as const;

const updateSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  plan_name: z.enum(PLAN_NAMES).optional(),
  paid_amount: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  valid_from: isoDateSchema.optional(),
  valid_until: isoDateSchema.optional(),
  payment_method: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select('*, tenants(id, name, created_at)')
    .order('valid_until', { ascending: true });

  if (error) return res.status(500).json({ error: 'שגיאה בטעינת מנויים' });

  const rows = (data || []).map((row: any) => {
    const computed = computeSubscriptionStatus(row);
    return {
      ...row,
      computed_status: computed.status,
      daysRemaining: computed.daysRemaining,
      isExpiringSoon: computed.isExpiringSoon,
    };
  });

  return res.json(rows);
});

router.get('/:tenantId', async (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.tenantId);
  if (!parsed.success) return res.status(400).json({ error: 'tenantId לא תקין' });

  try {
    const row = await ensureTenantSubscription(parsed.data);
    const computed = computeSubscriptionStatus(row);
    return res.json({
      ...row,
      computed_status: computed.status,
      daysRemaining: computed.daysRemaining,
      isExpiringSoon: computed.isExpiringSoon,
    });
  } catch (error) {
    return res.status(500).json({ error: 'שגיאה בטעינת מנוי' });
  }
});

router.patch('/:tenantId', async (req, res) => {
  const tenantIdParsed = z.string().uuid().safeParse(req.params.tenantId);
  if (!tenantIdParsed.success) return res.status(400).json({ error: 'tenantId לא תקין' });

  const body = updateSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message || 'נתונים לא תקינים' });

  const patch = body.data;
  await ensureTenantSubscription(tenantIdParsed.data);

  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .update(patch)
    .eq('tenant_id', tenantIdParsed.data)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: 'שגיאה בעדכון מנוי' });
  const computed = computeSubscriptionStatus(data as any);
  return res.json({ ...data, computed_status: computed.status, daysRemaining: computed.daysRemaining, isExpiringSoon: computed.isExpiringSoon });
});

router.post('/:tenantId/extend', async (req, res) => {
  const tenantIdParsed = z.string().uuid().safeParse(req.params.tenantId);
  if (!tenantIdParsed.success) return res.status(400).json({ error: 'tenantId לא תקין' });

  const parsed = z
    .object({
      months: z.coerce.number().int().min(1).max(36).optional(),
      valid_until: isoDateSchema.optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'נתונים לא תקינים' });

  const row = await ensureTenantSubscription(tenantIdParsed.data);

  let newValidUntil: string;
  if (parsed.data.valid_until) {
    newValidUntil = parsed.data.valid_until;
  } else {
    const months = parsed.data.months ?? 1;
    const base = new Date(`${row.valid_until}T00:00:00.000Z`);
    base.setUTCMonth(base.getUTCMonth() + months);
    newValidUntil = base.toISOString().slice(0, 10);
  }

  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .update({ valid_until: newValidUntil })
    .eq('tenant_id', tenantIdParsed.data)
    .select('*')
    .single();

  if (error || !data) return res.status(500).json({ error: 'שגיאה בהארכת מנוי' });
  const computed = computeSubscriptionStatus(data as any);
  return res.json({ ...data, computed_status: computed.status, daysRemaining: computed.daysRemaining, isExpiringSoon: computed.isExpiringSoon });
});

router.post('/:tenantId/send-reminder', async (req, res) => {
  const tenantIdParsed = z.string().uuid().safeParse(req.params.tenantId);
  if (!tenantIdParsed.success) return res.status(400).json({ error: 'tenantId לא תקין' });

  try {
    const result = await sendSubscriptionReminderForTenant(tenantIdParsed.data);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[subscriptions reminder] failed', error);
    return res.status(500).json({ error: 'שליחת תזכורת נכשלה' });
  }
});

router.post('/send-daily-reminders/run', async (_req, res) => {
  try {
    const result = await runDailySubscriptionReminders();
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[subscriptions daily reminders] failed', error);
    return res.status(500).json({ error: 'הרצת תזכורות יומית נכשלה' });
  }
});

export default router;
