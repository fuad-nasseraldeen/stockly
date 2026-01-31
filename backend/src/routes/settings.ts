import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { calcSellPrice, calcCostAfterDiscount } from '../lib/pricing.js';

const router = Router();

router.get('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const { data, error } = await supabase
    .from('settings')
    .select('tenant_id,vat_percent,global_margin_percent,use_margin,use_vat,updated_at')
    .eq('tenant_id', tenant.tenantId)
    .single();

  if (error) return res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  return res.json(data);
});

const updateSchema = z.object({
  vat_percent: z
    .coerce
    .number()
    .min(0, 'מע"מ חייב להיות 0 או יותר')
    .max(100, 'מע"מ לא יכול להיות מעל 100'),
  global_margin_percent: z
    .coerce
    .number()
    .min(0, 'אחוז רווח חייב להיות 0 או יותר')
    .max(500, 'אחוז רווח לא יכול להיות מעל 500')
    .optional(),
  use_margin: z
    .coerce
    .boolean()
    .optional(),
  use_vat: z
    .coerce
    .boolean()
    .optional(),
});

router.put('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const user = (req as any).user;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
  }

  const { vat_percent, global_margin_percent, use_margin, use_vat } = parsed.data;

  const patch: Record<string, unknown> = {
    vat_percent,
    updated_at: new Date().toISOString(),
  };
  if (global_margin_percent != null) {
    patch.global_margin_percent = global_margin_percent;
  }
  if (use_margin !== undefined) {
    patch.use_margin = use_margin;
  }
  if (use_vat !== undefined) {
    patch.use_vat = use_vat;
  }

  const { data, error } = await supabase
    .from('settings')
    .update(patch)
    .eq('tenant_id', tenant.tenantId)
    .select('tenant_id,vat_percent,global_margin_percent,use_margin,use_vat,updated_at')
    .single();

  if (error || !data) return res.status(400).json({ error: 'לא ניתן לעדכן הגדרות' });

  // After updating VAT / global margin / use_margin / use_vat, recalculate prices for all products for this tenant
  try {
    const newVat = Number(data.vat_percent);
    const newMargin = Number(data.global_margin_percent ?? global_margin_percent ?? 30);
    const newUseMargin = data.use_margin !== false; // Default to true if not set
    const newUseVat = data.use_vat !== false; // Default to true if not set

    // Get current price per product+supplier
    const { data: currentRows, error: currentErr } = await supabase
      .from('product_supplier_current_price')
      .select('product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount')
      .eq('tenant_id', tenant.tenantId);

    if (!currentErr && currentRows && currentRows.length > 0) {
      for (const row of currentRows as any[]) {
        const cost = Number(row.cost_price);
        if (!Number.isFinite(cost) || cost < 0) continue;

        const discountPercent = Number(row.discount_percent ?? 0);
        const costAfterDiscount = row.cost_price_after_discount 
          ? Number(row.cost_price_after_discount)
          : calcCostAfterDiscount(cost, discountPercent);

        // Recalculate sell price with new settings
        const sellPrice = calcSellPrice({
          cost_price: cost,
          margin_percent: newMargin,
          vat_percent: newVat,
          cost_price_after_discount: costAfterDiscount,
          use_margin: newUseMargin,
          use_vat: newUseVat,
        });

        await supabase.from('price_entries').insert({
          tenant_id: tenant.tenantId,
          product_id: row.product_id,
          supplier_id: row.supplier_id,
          cost_price: cost,
          discount_percent: discountPercent,
          cost_price_after_discount: costAfterDiscount,
          margin_percent: newMargin,
          sell_price: sellPrice,
          created_by: user.id,
        });
      }
    }
  } catch (err) {
    console.error('Error recalculating prices after settings update', err);
    // לא מפילים את הבקשה – ההגדרות עודכנו, רק הרה-חישוב נכשל
  }

  return res.json(data);
});

export default router;

