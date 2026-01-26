import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const { data, error } = await supabase
    .from('settings')
    .select('tenant_id,vat_percent,updated_at')
    .eq('tenant_id', tenant.tenantId)
    .single();

  if (error) return res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  return res.json(data);
});

const updateSchema = z.object({
  vat_percent: z.coerce.number().min(0, 'מע"מ חייב להיות 0 או יותר').max(100, 'מע"מ לא יכול להיות מעל 100'),
});

router.put('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
  }

  const { vat_percent } = parsed.data;
  const { data, error } = await supabase
    .from('settings')
    .update({ vat_percent, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant.tenantId)
    .select('tenant_id,vat_percent,updated_at')
    .single();

  if (error) return res.status(400).json({ error: 'לא ניתן לעדכן הגדרות' });
  return res.json(data);
});

export default router;

