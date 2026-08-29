import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant as { tenantId: string };
    const { data, error } = await supabase
      .from('external_inventory')
      .select('product_id,quantity,updated_at,products!inner(name,unit)')
      .eq('tenant_id', tenant.tenantId)
      .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'שגיאה בטעינת מלאי חיצוני' });
    return res.json({
      items: (data ?? []).map((row: any) => ({
        product_id: row.product_id,
        product_name: row.products?.name ?? 'מוצר שנמחק',
        unit: row.products?.unit ?? 'unit',
        quantity: Number(row.quantity),
        updated_at: row.updated_at,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'שגיאת שרת' });
  }
});

router.get('/summary', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant as { tenantId: string };
    const { count, error } = await supabase
      .from('external_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.tenantId);
    if (error) return res.status(500).json({ error: 'שגיאה בטעינת סיכום מלאי חיצוני' });
    return res.json({ productCount: count ?? 0 });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'שגיאת שרת' });
  }
});

// External inventory remains available even when subscription write enforcement is enabled.
// It is a standalone utility and does not mutate products, prices, supplier stock, or alerts.
router.post('/product/:productId/adjust', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant as { tenantId: string };
    const productId = z.string().uuid().safeParse(req.params.productId);
    const body = z.object({ delta: z.coerce.number().int().min(-1000000).max(1000000).refine((value) => value !== 0) }).safeParse(req.body);
    if (!productId.success || !body.success) return res.status(400).json({ error: 'נתוני מלאי חיצוני לא תקינים' });

    const { data, error } = await supabase.rpc('adjust_external_inventory', {
      p_tenant_id: tenant.tenantId,
      p_product_id: productId.data,
      p_delta: body.data.delta,
    });
    if (error) {
      if ((error.message || '').includes('product_not_found')) return res.status(404).json({ error: 'המוצר לא נמצא' });
      return res.status(400).json({ error: 'לא ניתן לעדכן מלאי חיצוני' });
    }
    const row = Array.isArray(data) ? data[0] : data;
    return res.json({ product_id: productId.data, quantity: row ? Number(row.result_quantity) : 0, removed: !row });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'שגיאת שרת' });
  }
});

export default router;
