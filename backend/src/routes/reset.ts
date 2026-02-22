import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant, ownerOnly } from '../middleware/auth.js';

const router = Router();

const resetSchema = z.object({
  confirmation: z
    .string()
    .refine((val) => val === 'DELETE', { message: 'יש להקליד DELETE לאישור' }),
});

// Reset tenant data (delete all data, recreate defaults)
router.post('/', requireAuth, requireTenant, ownerOnly, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const body = resetSchema.parse(req.body);

    if (body.confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'יש להקליד DELETE לאישור' });
    }

    // Delete in FK-safe order
    // Note: Using service role client which bypasses RLS
    await supabase.from('price_entries').delete().eq('tenant_id', tenant.tenantId);
    await supabase.from('products').delete().eq('tenant_id', tenant.tenantId);
    await supabase.from('suppliers').delete().eq('tenant_id', tenant.tenantId);
    await supabase.from('categories').delete().eq('tenant_id', tenant.tenantId).neq('name', 'כללי');
    await supabase.from('settings').delete().eq('tenant_id', tenant.tenantId);

    // Recreate defaults
    await supabase.from('settings').insert({
      tenant_id: tenant.tenantId,
      vat_percent: 18,
      decimal_precision: 2,
    });

    // Ensure default category exists
    const { data: defaultCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('name', 'כללי')
      .eq('is_active', true)
      .single();

    if (!defaultCategory) {
      await supabase.from('categories').insert({
        tenant_id: tenant.tenantId,
        name: 'כללי',
        default_margin_percent: 0,
        is_active: true,
        created_by: user.id,
      });
    }

    res.json({ message: 'נתוני החנות אופסו בהצלחה' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return res.status(400).json({ error: firstIssue?.message || 'נתונים לא תקינים' });
    }
    console.error('Reset error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
