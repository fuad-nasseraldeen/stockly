import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { calcSellPrice, calcCostAfterDiscount, clampDecimalPrecision, roundToPrecision } from '../lib/pricing.js';

const router = Router();

// Helper function for bulk operations
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

router.get('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const { data, error } = await supabase
    .from('settings')
    .select('tenant_id,vat_percent,global_margin_percent,use_margin,use_vat,decimal_precision,updated_at')
    .eq('tenant_id', tenant.tenantId)
    .single();

  if (error) return res.status(500).json({ error: 'שגיאה בטעינת הגדרות' });
  return res.json(data ? { ...data, decimal_precision: (data as any).decimal_precision ?? 2 } : data);
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
    .max(100, 'אחוז רווח לא יכול להיות מעל 100')
    .optional(),
  use_margin: z
    .coerce
    .boolean()
    .optional(),
  use_vat: z
    .coerce
    .boolean()
    .optional(),
  decimal_precision: z
    .coerce
    .number()
    .int('דיוק עשרוני חייב להיות מספר שלם')
    .min(0, 'דיוק עשרוני חייב להיות 0 או יותר')
    .max(5, 'דיוק עשרוני לא יכול להיות מעל 5')
    .optional(),
});

router.put('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const user = (req as any).user;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
  }

  const { vat_percent, global_margin_percent, use_margin, use_vat, decimal_precision } = parsed.data;

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
  if (decimal_precision !== undefined) {
    patch.decimal_precision = clampDecimalPrecision(decimal_precision);
  }
  if (use_vat !== undefined) {
    patch.use_vat = use_vat;
  }

  const { data, error } = await supabase
    .from('settings')
    .update(patch)
    .eq('tenant_id', tenant.tenantId)
    .select('tenant_id,vat_percent,global_margin_percent,use_margin,use_vat,decimal_precision,updated_at')
    .single();

  if (error || !data) return res.status(400).json({ error: 'לא ניתן לעדכן הגדרות' });

  // After updating VAT / global margin / use_margin / use_vat, recalculate prices for all products for this tenant
  // FAST VERSION: Bulk operations instead of one-by-one inserts
  try {
    const newVat = Number(data.vat_percent);
    const newMargin = Number(data.global_margin_percent ?? global_margin_percent ?? 0);
    const newUseMargin = data.use_margin === true; // Default to false if not set
    const newUseVat = data.use_vat === true;
    const decimalPrecision = clampDecimalPrecision((data as any).decimal_precision, 2);

    // Get ALL current prices (paginate to overcome PostgREST 1000-row default)
    const currentRows: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageErr } = await supabase
        .from('product_supplier_current_price')
        .select('product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,sell_price')
        .eq('tenant_id', tenant.tenantId)
        .range(offset, offset + pageSize - 1);
      if (pageErr) break;
      if (!page || page.length === 0) break;
      currentRows.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    if (currentRows.length > 0) {
      const pairKeys = new Set(currentRows.map((r: any) => `${r.product_id}||${r.supplier_id}`));
      const latestPriceByPair = new Map<string, { cost_price: number; discount_percent: number | null; margin_percent: number; sell_price: number }>();

      // Fetch price_entries paginated; first occurrence per pair (ordered by created_at DESC) = latest
      let peOffset = 0;
      const pePageSize = 1000;
      while (latestPriceByPair.size < pairKeys.size) {
        const { data: pePage } = await supabase
          .from('price_entries')
          .select('product_id,supplier_id,cost_price,discount_percent,margin_percent,sell_price,created_at')
          .eq('tenant_id', tenant.tenantId)
          .order('created_at', { ascending: false })
          .range(peOffset, peOffset + pePageSize - 1);
        if (!pePage || pePage.length === 0) break;
        for (const p of pePage) {
          const key = `${p.product_id}||${p.supplier_id}`;
          if (pairKeys.has(key) && !latestPriceByPair.has(key)) {
            latestPriceByPair.set(key, {
              cost_price: Number(p.cost_price),
              discount_percent: p.discount_percent === null ? null : Number(p.discount_percent),
              margin_percent: Number(p.margin_percent ?? 0),
              sell_price: Number(p.sell_price),
            });
          }
        }
        if (pePage.length < pePageSize) break;
        peOffset += pePageSize;
      }

      // Build all price entries to insert (when sell_price OR margin_percent changed - e.g. imported products with old margin)
      const priceRowsToInsert: any[] = [];

      for (const row of currentRows as any[]) {
        const cost = Number(row.cost_price);
        if (!Number.isFinite(cost) || cost < 0) continue;

        const discountPercent = Number(row.discount_percent ?? 0);
        const costAfterDiscount = row.cost_price_after_discount
          ? Number(row.cost_price_after_discount)
          : calcCostAfterDiscount(cost, discountPercent, decimalPrecision);

        // Recalculate sell price with new settings
        const sellPrice = calcSellPrice({
          cost_price: cost,
          margin_percent: newMargin,
          vat_percent: newVat,
          cost_price_after_discount: costAfterDiscount,
          use_margin: newUseMargin,
          use_vat: newUseVat,
          precision: decimalPrecision,
        });

        const newMarginRounded = roundToPrecision(newMargin, decimalPrecision);
        const key = `${row.product_id}||${row.supplier_id}`;
        const current = latestPriceByPair.get(key);

        // Insert if: sell_price changed OR margin_percent changed (e.g. imported products had margin=0, now we have 5%)
        const same =
          current &&
          Number(current.cost_price) === cost &&
          Number(current.discount_percent ?? 0) === discountPercent &&
          Number(current.sell_price) === sellPrice &&
          Number(current.margin_percent) === newMarginRounded;

        if (!same) {
          priceRowsToInsert.push({
            tenant_id: tenant.tenantId,
            product_id: row.product_id,
            supplier_id: row.supplier_id,
            cost_price: cost,
            discount_percent: roundToPrecision(discountPercent, decimalPrecision),
            cost_price_after_discount: costAfterDiscount,
            margin_percent: roundToPrecision(newMargin, decimalPrecision),
            sell_price: sellPrice,
            created_by: user.id,
          });
        }
      }

      // Bulk insert in chunks of 500
      if (priceRowsToInsert.length > 0) {
        for (const part of chunk(priceRowsToInsert, 500)) {
          const { error: insertError } = await supabase
            .from('price_entries')
            .insert(part);
          
          if (insertError) {
            console.error('Bulk price insert failed:', insertError);
            // Continue with next chunk even if one fails
          }
        }
      }
    }
  } catch (err) {
    console.error('Error recalculating prices after settings update', err);
    // לא מפילים את הבקשה – ההגדרות עודכנו, רק הרה-חישוב נכשל
  }

  return res.json(data ? { ...data, decimal_precision: (data as any).decimal_precision ?? 2 } : data);
});

// User preferences endpoints
const PREFERENCE_KEY_COLUMN_LAYOUT = 'price_table_layout';

router.get('/preferences/:key', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const user = (req as any).user;
  const { key } = req.params;

  const { data, error } = await supabase
    .from('user_preferences')
    .select('preference_value')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.tenantId)
    .eq('preference_key', key)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    return res.status(500).json({ error: 'שגיאה בטעינת העדפות' });
  }

  return res.json(data?.preference_value || null);
});

router.put('/preferences/:key', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const user = (req as any).user;
  const { key } = req.params;

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'נתונים לא תקינים' });
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: user.id,
      tenant_id: tenant.tenantId,
      preference_key: key,
      preference_value: req.body,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,tenant_id,preference_key',
    })
    .select('preference_value')
    .single();

  if (error) {
    return res.status(500).json({ error: 'שגיאה בשמירת העדפות' });
  }

  return res.json(data?.preference_value || null);
});

router.delete('/preferences/:key', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const user = (req as any).user;
  const { key } = req.params;

  const { error } = await supabase
    .from('user_preferences')
    .delete()
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.tenantId)
    .eq('preference_key', key);

  if (error) {
    return res.status(500).json({ error: 'שגיאה במחיקת העדפות' });
  }

  return res.json({ success: true });
});

export default router;

