import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';

const router = Router();

async function getStockTrackingEnabled(tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('settings')
    .select('stock_tracking_enabled')
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) return false;
  return (data as { stock_tracking_enabled?: boolean }).stock_tracking_enabled === true;
}

const updateBodySchema = z.object({
  stock_quantity: z.coerce.number().min(0, 'כמות מלאי חייבת להיות 0 או יותר'),
  min_threshold: z.coerce.number().min(0, 'סף מינימום חייב להיות 0 או יותר').optional(),
  expected_updated_at: z.string().nullable().optional(),
});

/** GET /api/stock/low — derived low-stock rows (no persistence of alerts) */
router.get('/low', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant as { tenantId: string };
    const enabled = await getStockTrackingEnabled(tenant.tenantId);
    if (!enabled) {
      return res.json({
        stockTrackingEnabled: false,
        items: [] as unknown[],
      });
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const criticalOnly = req.query.critical === '1' || req.query.critical === 'true';

    const { data, error } = await supabase.rpc('list_low_stock', {
      p_tenant_id: tenant.tenantId,
      p_search: q.length > 0 ? q : null,
      p_critical_only: criticalOnly,
    });

    if (error) {
      console.error('list_low_stock RPC error', error);
      return res.status(500).json({ error: 'שגיאה בטעינת התראות מלאי' });
    }

    return res.json({
      stockTrackingEnabled: true,
      items: data ?? [],
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || 'שגיאת שרת' });
  }
});

/** GET /api/stock/product/:productId — all stock rows for one product */
router.get('/product/:productId', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant as { tenantId: string };
    const { productId } = req.params;
    const parsedId = z.string().uuid().safeParse(productId);
    if (!parsedId.success) {
      return res.status(400).json({ error: 'מזהה מוצר לא תקין' });
    }

    if (!(await getStockTrackingEnabled(tenant.tenantId))) {
      return res.json({ stockTrackingEnabled: false, rows: [] });
    }

    const { data, error } = await supabase
      .from('product_supplier_stock')
      .select('id,product_id,supplier_id,stock_quantity,min_threshold,updated_at')
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', parsedId.data)
      .order('supplier_id');

    if (error) {
      return res.status(500).json({ error: 'שגיאה בטעינת מלאי' });
    }

    return res.json({ stockTrackingEnabled: true, rows: data ?? [] });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || 'שגיאת שרת' });
  }
});

/** PUT /api/stock/product/:productId/supplier/:supplierId — transactional row lock via RPC */
router.put(
  '/product/:productId/supplier/:supplierId',
  requireAuth,
  requireTenant,
  async (req, res) => {
    try {
      const tenant = (req as any).tenant as { tenantId: string };
      if (!(await getStockTrackingEnabled(tenant.tenantId))) {
        return res.status(403).json({ error: 'מעקב מלאי לא פעיל בהגדרות החנות' });
      }

      const { productId, supplierId } = req.params;
      const ids = z.object({
        productId: z.string().uuid(),
        supplierId: z.string().uuid(),
      }).safeParse({ productId, supplierId });
      if (!ids.success) {
        return res.status(400).json({ error: 'מזהים לא תקינים' });
      }

      const parsed = updateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
      }

      const applyMin = parsed.data.min_threshold !== undefined;
      const { data, error } = await supabase.rpc('set_product_supplier_stock', {
        p_tenant_id: tenant.tenantId,
        p_product_id: ids.data.productId,
        p_supplier_id: ids.data.supplierId,
        p_stock_quantity: parsed.data.stock_quantity,
        p_apply_min_threshold: applyMin,
        p_min_threshold: applyMin ? parsed.data.min_threshold ?? 0 : null,
        p_expected_updated_at: parsed.data.expected_updated_at ?? null,
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('stock_version_conflict') || msg.includes('P0001')) {
          return res.status(409).json({ error: 'המלאי עודכן על ידי משתמש אחר. רענן ונסה שוב.' });
        }
        if (msg.includes('product_not_found') || msg.includes('supplier_not_found') || msg.includes('P0002')) {
          return res.status(404).json({ error: 'מוצר או ספק לא נמצא' });
        }
        console.error('set_product_supplier_stock', error);
        return res.status(400).json({ error: 'לא ניתן לעדכן מלאי' });
      }

      const row = Array.isArray(data) ? data[0] : data;
      return res.json(row ?? null);
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e?.message || 'שגיאת שרת' });
    }
  },
);

export default router;
