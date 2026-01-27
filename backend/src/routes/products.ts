import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { normalizeName } from '../lib/normalize.js';
import { calcSellPrice, round2 } from '../lib/pricing.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';

const router = Router();

const productSchema = z.object({
  name: z.string().trim().min(1, 'חובה להזין שם מוצר'),
  category_id: z.string().uuid().nullable().optional(),
  unit: z.enum(['unit', 'kg', 'liter']).optional(),
});

const priceSchema = z.object({
  supplier_id: z.string().uuid('חובה לבחור ספק'),
  cost_price: z.coerce.number().min(0, 'חובה להזין מחיר (0 ומעלה)'),
  margin_percent: z.coerce.number().min(0, 'אחוז רווח חייב להיות 0 או יותר').max(500, 'אחוז רווח לא יכול להיות מעל 500').optional(),
});

async function getVatPercent(tenantId: string): Promise<number> {
  const { data, error } = await supabase.from('settings').select('vat_percent').eq('tenant_id', tenantId).single();
  if (error || !data) return 18;
  return Number(data.vat_percent);
}

async function getCategoryDefaultMargin(tenantId: string, categoryId: string | null | undefined): Promise<number> {
  if (!categoryId) {
    const { data: settings } = await supabase
      .from('settings')
      .select('global_margin_percent')
      .eq('tenant_id', tenantId)
      .single();
    return Number(settings?.global_margin_percent ?? 30);
  }
  const { data } = await supabase
    .from('categories')
    .select('default_margin_percent')
    .eq('tenant_id', tenantId)
    .eq('id', categoryId)
    .single();
  if (!data) {
    const { data: settings } = await supabase
      .from('settings')
      .select('global_margin_percent')
      .eq('tenant_id', tenantId)
      .single();
    return Number(settings?.global_margin_percent ?? 30);
  }
  return Number(data.default_margin_percent ?? 30);
}

// Get all products
router.get('/', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;
    const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updated_desc';

    // Base products
    let productsQ = supabase
      .from('products')
      .select('id,name,category_id,unit,created_at,categories(id,name,default_margin_percent)')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true);

    if (search) productsQ = productsQ.ilike('name', `%${search}%`);
    if (categoryId) productsQ = productsQ.eq('category_id', categoryId);

    const { data: products, error: productsErr } = await productsQ.order('name');
    if (productsErr) return res.status(500).json({ error: 'שגיאה בטעינת מוצרים' });

    const productIds = (products ?? []).map((p: any) => p.id);
    if (productIds.length === 0) return res.json([]);

    // Current prices per product+supplier (view)
    let currentQ = supabase
      .from('product_supplier_current_price')
      .select('product_id,supplier_id,cost_price,margin_percent,sell_price,created_at')
      .eq('tenant_id', tenant.tenantId)
      .in('product_id', productIds);

    if (supplierId) currentQ = currentQ.eq('supplier_id', supplierId);

    const { data: currentRows, error: currentErr } = await currentQ;
    if (currentErr) return res.status(500).json({ error: 'שגיאה בטעינת מחירים עדכניים' });

    // Suppliers for the current rows (to show names)
    const supplierIds = Array.from(new Set((currentRows ?? []).map((r: any) => r.supplier_id)));
    const { data: suppliers } =
      supplierIds.length > 0
        ? await supabase
            .from('suppliers')
            .select('id,name')
            .eq('tenant_id', tenant.tenantId)
            .in('id', supplierIds)
            .eq('is_active', true)
        : { data: [] as any[] };
    const supplierNameById = new Map((suppliers ?? []).map((s: any) => [s.id, s.name]));

    // Summary view per product
    const { data: summaries, error: sumErr } = await supabase
      .from('product_price_summary')
      .select('product_id,min_current_cost_price,min_current_sell_price,last_price_update_at')
      .eq('tenant_id', tenant.tenantId)
      .in('product_id', productIds);
    if (sumErr) return res.status(500).json({ error: 'שגיאה בטעינת סיכום מחירים' });
    const summaryByProductId = new Map((summaries ?? []).map((s: any) => [s.product_id, s]));

    // Group current prices by product, sort by lowest cost first (default)
    const currentByProduct = new Map<string, any[]>();
    for (const row of currentRows ?? []) {
      const list = currentByProduct.get(row.product_id) ?? [];
      list.push({
        ...row,
        supplier_name: supplierNameById.get(row.supplier_id) ?? null,
      });
      currentByProduct.set(row.product_id, list);
    }
    for (const [pid, list] of currentByProduct.entries()) {
      list.sort((a, b) => Number(a.cost_price) - Number(b.cost_price));
      currentByProduct.set(pid, list);
    }

    // Shape response
    let result = (products ?? []).map((p: any) => {
      const summary = summaryByProductId.get(p.id) ?? null;
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        category: p.categories ?? null,
        prices: currentByProduct.get(p.id) ?? [],
        summary,
      };
    });

    // When filtering by supplier – hide products that don't have a price for that supplier
    if (supplierId) {
      result = result.filter((p: any) => p.prices && p.prices.length > 0);
    }

    // Sort options based on summary
    const getMin = (r: any) => Number(r.summary?.min_current_cost_price ?? Number.POSITIVE_INFINITY);
    const getUpdated = (r: any) => new Date(r.summary?.last_price_update_at ?? 0).getTime();
    if (sort === 'price_asc') result.sort((a, b) => getMin(a) - getMin(b));
    else if (sort === 'price_desc') result.sort((a, b) => getMin(b) - getMin(a));
    else if (sort === 'updated_asc') result.sort((a, b) => getUpdated(a) - getUpdated(b));
    else result.sort((a, b) => getUpdated(b) - getUpdated(a));

    return res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single product
router.get('/:id', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const { id } = req.params;
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories(id, name, default_margin_percent),
        product_current_price(supplier_id, cost_price, margin_percent, sell_price, created_at)
      `)
      .eq('tenant_id', tenant.tenantId)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    // Add current prices per supplier + summary
    const { data: current } = await supabase
      .from('product_supplier_current_price')
      .select('product_id,supplier_id,cost_price,margin_percent,sell_price,created_at')
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', id);

    const supplierIds = Array.from(new Set((current ?? []).map((r: any) => r.supplier_id)));
    const { data: suppliers } =
      supplierIds.length > 0
        ? await supabase
            .from('suppliers')
            .select('id,name')
            .eq('tenant_id', tenant.tenantId)
            .in('id', supplierIds)
            .eq('is_active', true)
        : { data: [] as any[] };
    const supplierNameById = new Map((suppliers ?? []).map((s: any) => [s.id, s.name]));

    const prices = (current ?? [])
      .map((r: any) => ({ ...r, supplier_name: supplierNameById.get(r.supplier_id) ?? null }))
      .sort((a: any, b: any) => Number(a.cost_price) - Number(b.cost_price));

    const { data: summary } = await supabase
      .from('product_price_summary')
      .select('product_id,min_current_cost_price,min_current_sell_price,last_price_update_at')
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', id)
      .single();

    res.json({ ...data, prices, summary: summary ?? null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new price entry (keeps history)
router.post('/:id/prices', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const productId = req.params.id;
    const parsed = priceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
    }

    // Validate product exists and active
    const prodCheck = await supabase
      .from('products')
      .select('id,category_id')
      .eq('tenant_id', tenant.tenantId)
      .eq('id', productId)
      .eq('is_active', true)
      .single();
    if (prodCheck.error || !prodCheck.data) return res.status(404).json({ error: 'המוצר לא נמצא' });

    const { supplier_id, cost_price, margin_percent } = parsed.data;

    // Validate supplier exists and active
    const supplierCheck = await supabase
      .from('suppliers')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('id', supplier_id)
      .eq('is_active', true)
      .single();
    if (supplierCheck.error) return res.status(400).json({ error: 'הספק שנבחר לא קיים או לא פעיל' });

    const vat_percent = await getVatPercent(tenant.tenantId);
    const defaultMargin = await getCategoryDefaultMargin(tenant.tenantId, prodCheck.data.category_id);
    const finalMargin = margin_percent ?? defaultMargin;
    const sell_price = calcSellPrice({ cost_price, margin_percent: finalMargin, vat_percent });

    const { data, error } = await supabase
      .from('price_entries')
      .insert({
        tenant_id: tenant.tenantId,
        product_id: productId,
        supplier_id,
        cost_price: round2(cost_price),
        margin_percent: round2(finalMargin),
        sell_price,
        created_by: user.id,
      })
      .select('id,product_id,supplier_id,cost_price,margin_percent,sell_price,created_at')
      .single();

    if (error) return res.status(400).json({ error: 'לא ניתן לשמור מחיר. נסה שוב.' });
    return res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Price history per product (+ optional supplier filter)
router.get('/:id/price-history', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const productId = req.params.id;
    const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;

    let q = supabase
      .from('price_entries')
      .select('id,product_id,supplier_id,cost_price,margin_percent,sell_price,created_at')
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (supplierId) q = q.eq('supplier_id', supplierId);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: 'שגיאה בטעינת היסטוריית מחירים' });
    return res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
router.post('/', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const parsedProduct = productSchema.safeParse(req.body);
    const parsedPrice = priceSchema.safeParse(req.body);
    if (!parsedProduct.success) {
      return res.status(400).json({ error: parsedProduct.error.issues[0]?.message ?? 'נתונים לא תקינים' });
    }
    if (!parsedPrice.success) {
      return res.status(400).json({ error: parsedPrice.error.issues[0]?.message ?? 'נתונים לא תקינים' });
    }

    const { name, category_id, unit } = parsedProduct.data;
    const { supplier_id, cost_price, margin_percent } = parsedPrice.data;

    // Validate supplier exists and active
    const supplierCheck = await supabase
      .from('suppliers')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('id', supplier_id)
      .eq('is_active', true)
      .single();
    if (supplierCheck.error) return res.status(400).json({ error: 'הספק שנבחר לא קיים או לא פעיל' });

    const vat_percent = await getVatPercent(tenant.tenantId);

    // If no category was provided, default to "כללי"
    let effectiveCategoryId = category_id ?? null;
    if (!effectiveCategoryId) {
      const generalName = 'כללי';
      let general = await supabase
        .from('categories')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('name', generalName)
        .eq('is_active', true)
        .single();

      if (general.error && general.error.code !== 'PGRST116') {
        return res.status(400).json({ error: 'לא ניתן ליצור מוצר (שגיאה בטעינת קטגוריה כללי)' });
      }

      if (!general.data) {
        const created = await supabase
          .from('categories')
          .insert({
            tenant_id: tenant.tenantId,
            name: generalName,
            default_margin_percent: 0,
            is_active: true,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (created.error || !created.data) {
          return res.status(400).json({ error: 'לא ניתן ליצור מוצר (שגיאה ביצירת קטגוריה כללי)' });
        }
        general = created;
      }

      effectiveCategoryId = general.data!.id as string;
    }

    const defaultMargin = await getCategoryDefaultMargin(tenant.tenantId, effectiveCategoryId);
    const finalMargin = margin_percent ?? defaultMargin;
    const sell_price = calcSellPrice({ cost_price, margin_percent: finalMargin, vat_percent });

    // Create product first
    const name_norm = normalizeName(name);
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .insert({
        tenant_id: tenant.tenantId,
        name: name.trim(),
        name_norm,
        category_id: effectiveCategoryId,
        unit: unit ?? 'unit',
        is_active: true,
        created_by: user.id,
      })
      .select('id,name,category_id,unit,created_at')
      .single();

    if (prodErr || !product) {
      return res.status(409).json({ error: 'מוצר בשם הזה כבר קיים בקטגוריה' });
    }

    // Then create price entry (history)
    const { error: priceErr } = await supabase.from('price_entries').insert({
      tenant_id: tenant.tenantId,
      product_id: product.id,
      supplier_id,
      cost_price: round2(cost_price),
      margin_percent: round2(finalMargin),
      sell_price,
      created_by: user.id,
    });

    if (priceErr) {
      // Rollback: delete product (safe: no history yet)
      await supabase.from('products').delete().eq('id', product.id);
      return res.status(400).json({ error: 'לא ניתן לשמור מחיר למוצר. נסה שוב.' });
    }

    return res.status(201).json({ ...product });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update product
router.put('/:id', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const id = req.params.id;
    const parsed = productSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' });
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.name != null) {
      patch.name = parsed.data.name.trim();
      patch.name_norm = normalizeName(parsed.data.name);
    }
    if (parsed.data.category_id !== undefined) patch.category_id = parsed.data.category_id ?? null;
    if (parsed.data.unit != null) patch.unit = parsed.data.unit;

    const { data, error } = await supabase
      .from('products')
      .update(patch)
      .eq('tenant_id', tenant.tenantId)
      .eq('id', id)
      .select('id,name,category_id,unit,created_at')
      .single();

    if (error) return res.status(400).json({ error: 'לא ניתן לעדכן מוצר (ייתכן שיש כפילות בשם)' });
    return res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
router.delete('/:id', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const { id } = req.params;
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('tenant_id', tenant.tenantId)
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
