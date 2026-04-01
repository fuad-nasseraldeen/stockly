import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { clampDecimalPrecision } from '../lib/pricing.js';
import { runRecalcPricesForTenant } from '../lib/recalc-prices.js';

const router = Router();

function supabaseErrPayload(error: { message?: string; code?: string; details?: string; hint?: string } | null) {
  if (!error) return undefined;
  return {
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

/** Stable JSON shape; PostgREST sometimes omits new columns until schema reload — never drop this key */
function serializeSettingsRow(
  row: Record<string, unknown>,
  opts?: { stock_tracking_sent?: boolean | undefined },
): Record<string, unknown> {
  const fromDb = row.stock_tracking_enabled === true;
  const stock =
    opts?.stock_tracking_sent !== undefined
      ? opts.stock_tracking_sent === true
      : fromDb;
  return {
    tenant_id: row.tenant_id,
    vat_percent: row.vat_percent,
    global_margin_percent: row.global_margin_percent ?? null,
    use_margin: row.use_margin ?? null,
    use_vat: row.use_vat ?? null,
    decimal_precision: row.decimal_precision ?? 2,
    stock_tracking_enabled: stock,
    updated_at: row.updated_at,
  };
}

router.get('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const { data, error } = await supabase
    .from('settings')
    .select('tenant_id,vat_percent,global_margin_percent,use_margin,use_vat,decimal_precision,stock_tracking_enabled,updated_at')
    .eq('tenant_id', tenant.tenantId)
    .single();

  if (error) {
    const raw = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''} ${error.code ?? ''}`;
    console.error('[settings GET] supabase error', { tenantId: tenant.tenantId, error });
    if (/stock_tracking_enabled|42703|could not find|schema cache|undefined column|column .* does not exist|PGRST204/i.test(raw)) {
      return res.status(500).json({
        error:
          'חסרה עמודת stock_tracking_enabled בטבלת settings. הרץ ב-SQL Editor את פקודת ה-ADD COLUMN ממיגרציה 0040, או את 0039 מהשורה הראשונה.',
        code: 'STOCK_SETTINGS_COLUMN_MISSING',
        supabase: supabaseErrPayload(error),
      });
    }
    return res.status(500).json({
      error: 'שגיאה בטעינת הגדרות',
      supabase: supabaseErrPayload(error),
    });
  }
  return res.json(data ? serializeSettingsRow(data as Record<string, unknown>) : data);
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
  stock_tracking_enabled: z.boolean().optional(),
});

router.put('/', requireAuth, requireTenant, async (req, res) => {
  const tenant = (req as any).tenant;
  const user = (req as any).user;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
  }

  const { vat_percent, global_margin_percent, use_margin, use_vat, decimal_precision, stock_tracking_enabled } =
    parsed.data;

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
  if (stock_tracking_enabled !== undefined) {
    patch.stock_tracking_enabled = stock_tracking_enabled;
  }

  const { data, error } = await supabase
    .from('settings')
    .update(patch)
    .eq('tenant_id', tenant.tenantId)
    .select('tenant_id,vat_percent,global_margin_percent,use_margin,use_vat,decimal_precision,stock_tracking_enabled,updated_at')
    .single();

  if (error || !data) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string } | null;
    const raw = `${e?.message ?? ''} ${e?.details ?? ''} ${e?.hint ?? ''} ${e?.code ?? ''}`;
    console.error('[settings PUT] supabase error', { tenantId: tenant.tenantId, error: e, patchKeys: Object.keys(patch) });

    const missingStockColumn =
      /stock_tracking_enabled|42703|could not find|schema cache|undefined column|column .* does not exist|PGRST204/i.test(
        raw,
      );

    const noRows =
      e?.code === 'PGRST116' || /0 rows|no rows|contains 0 rows/i.test(raw);

    if (missingStockColumn) {
      return res.status(400).json({
        error:
          'חסרה בטבלת settings העמודה stock_tracking_enabled. הרץ ב-SQL Editor: ALTER TABLE settings ADD COLUMN IF NOT EXISTS stock_tracking_enabled boolean NOT NULL DEFAULT false; (או מיגרציה 0040_ensure_settings_stock_tracking_column.sql), ואז רענן את ה-Schema ב-Supabase אם צריך.',
        code: 'STOCK_SETTINGS_COLUMN_MISSING',
        supabase: supabaseErrPayload(e),
      });
    }

    if (noRows) {
      return res.status(400).json({
        error:
          'לא נמצאה שורת הגדרות לחנות הנוכחית. פנה לתמיכה או צור חנות מחדש.',
        code: 'SETTINGS_ROW_MISSING',
        supabase: supabaseErrPayload(e),
      });
    }

    return res.status(400).json({
      error: 'לא ניתן לעדכן הגדרות',
      supabase: supabaseErrPayload(e),
    });
  }

  // After updating VAT / global margin / use_margin / use_vat – recalculate all prices (including imported)
  try {
    await runRecalcPricesForTenant(tenant.tenantId, user.id, { retries: 1 });
  } catch (err) {
    console.error('Error recalculating prices after settings update', err);
    // לא מפילים את הבקשה – ההגדרות עודכנו, רק הרה-חישוב נכשל
  }

  return res.json(
    serializeSettingsRow(data as Record<string, unknown>, {
      stock_tracking_sent: stock_tracking_enabled,
    }),
  );
});

/**
 * POST /api/settings/recalculate-prices
 * Recalculates all product prices using current settings (global margin, VAT, etc.).
 * Fallback when auto-recalc failed or user wants to force refresh.
 */
router.post('/recalculate-prices', requireAuth, requireTenant, async (req, res) => {
  const reqAny = req as unknown as { tenant: { tenantId: string }; user: { id: string } };
  const tenant = reqAny.tenant;
  const user = reqAny.user;

  try {
    const { updated } = await runRecalcPricesForTenant(tenant.tenantId, user.id, { retries: 1 });
    return res.json({
      success: true,
      updated,
      message: updated > 0 ? `עודכנו ${updated} מחירים בהצלחה` : 'כל המחירים כבר מעודכנים',
    });
  } catch (err) {
    console.error('Error recalculating prices:', err);
    return res.status(500).json({ error: 'שגיאה בחישוב מחירים מחדש' });
  }
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

