import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { normalizeName } from '../lib/normalize.js';
import { calcSellPrice, calcCostAfterDiscount, round2 } from '../lib/pricing.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';

const router = Router();

// Cache removed - RPC function handles pagination and sorting in DB, making cache unnecessary

const productSchema = z.object({
  name: z.string().trim().min(1, 'חובה להזין שם מוצר'),
  category_id: z.string().uuid().nullable().optional(),
  unit: z.enum(['unit', 'kg', 'liter']).optional(),
  sku: z.string().trim().optional().nullable(),
  package_quantity: z.coerce.number().min(0.01, 'כמות באריזה חייבת להיות גדולה מ-0').optional(),
});

const priceSchema = z.object({
  supplier_id: z.string().uuid('חובה לבחור ספק'),
  cost_price: z.coerce.number().min(0, 'חובה להזין מחיר (0 ומעלה)'),
  // margin_percent נשמר בסכמה רק כדי לתמוך בקריאות ישנות, אבל מתעלמים ממנו בחישוב בפועל
  margin_percent: z.coerce
    .number()
    .min(0)
    .max(500)
    .optional()
    .optional(),
  discount_percent: z.coerce.number().min(0).max(100).optional(),
  package_quantity: z.coerce.number().min(0.01, 'כמות באריזה חייבת להיות גדולה מ-0').optional(),
});

async function getVatPercent(tenantId: string): Promise<number> {
  const { data, error } = await supabase.from('settings').select('vat_percent').eq('tenant_id', tenantId).single();
  if (error || !data) return 18;
  return Number(data.vat_percent);
}

async function getGlobalMarginPercent(tenantId: string): Promise<number> {
  const { data } = await supabase
    .from('settings')
    .select('global_margin_percent')
    .eq('tenant_id', tenantId)
    .single();
  return Number(data?.global_margin_percent ?? 30);
}

async function getUseMargin(tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('settings')
    .select('use_margin')
    .eq('tenant_id', tenantId)
    .single();
  return data?.use_margin === true; // Default to false if not set
}

async function getUseVat(tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('settings')
    .select('use_vat')
    .eq('tenant_id', tenantId)
    .single();
  return data?.use_vat === true; // Default to false if not set
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
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;
    const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updated_desc';
    
    // Pagination parameters
    const page = Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '10', 10)));
    const offset = (page - 1) * pageSize;

    // Step 1: determine which product IDs match (fuzzy search when search term exists)
    // OPTIMIZED: Use RPC function to get paginated product IDs with total count
    // This pushes sorting and pagination to the database - MUCH faster!
    const searchNormalized = search && search.trim() ? normalizeName(search.trim()) : null;
    
    // Log search params for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Calling RPC with params:', {
        tenant_uuid: tenant.tenantId,
        search_text: searchNormalized,
        search_original: search,
        supplier_uuid: supplierId || null,
        category_uuid: categoryId || null,
        sort_text: sort,
        limit_results: pageSize,
        offset_results: (page - 1) * pageSize,
      });
    }
    
    const { data: pageData, error: rpcError } = await supabase.rpc('products_list_page', {
      tenant_uuid: tenant.tenantId,
      search_text: searchNormalized,
      supplier_uuid: supplierId || null,
      category_uuid: categoryId || null,
      sort_text: sort,
      limit_results: pageSize,
      offset_results: (page - 1) * pageSize,
    });

    if (rpcError) {
      console.error('RPC products_list_page error:', rpcError);
      console.error('Error details:', JSON.stringify(rpcError, null, 2));
      // If RPC function doesn't exist (42883), fall back to old method
      if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
        console.warn('RPC function not found, falling back to old search method');
        // Fall back to old method - but this should not happen if migration ran
        return res.status(500).json({ 
          error: 'פונקציית חיפוש לא נמצאה. יש להריץ את migration 0018',
          details: rpcError.message 
        });
      }
      return res.status(500).json({ 
        error: 'שגיאה בחיפוש מוצרים', 
        details: rpcError.message,
        code: rpcError.code 
      });
    }

    if (!pageData || pageData.length === 0) {
      return res.json({ 
        products: [], 
        total: 0, 
        page, 
        totalPages: 0 
      });
    }

    // Extract product IDs and total count from RPC result
    const pageProductIds = pageData.map((r: any) => r.product_id);
    const totalCount = pageData[0]?.total_count ?? 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Now load details ONLY for the products on this page
    const { data: pageProducts, error: productsErr } = await supabase
      .from('products')
      .select('id,name,category_id,unit,sku,package_quantity,created_at,categories(id,name,default_margin_percent)')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true)
      .in('id', pageProductIds);
    
    if (productsErr) return res.status(500).json({ error: 'שגיאה בטעינת מוצרים' });

    if (!pageProducts || pageProducts.length === 0) {
      return res.json({ 
        products: [], 
        total: totalCount, 
        page, 
        totalPages 
      });
    }

    // Load prices and summaries ONLY for page products
    let currentQ = supabase
      .from('product_supplier_current_price')
      .select('product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at')
      .eq('tenant_id', tenant.tenantId)
      .in('product_id', pageProductIds);

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

    // Summary view per product - ONLY for page products
    const { data: summaries, error: sumErr } = await supabase
      .from('product_price_summary')
      .select('product_id,min_current_cost_price,min_current_sell_price,last_price_update_at')
      .eq('tenant_id', tenant.tenantId)
      .in('product_id', pageProductIds);
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

    // Shape response - maintain RPC sort order
    const productById = new Map((pageProducts ?? []).map((p: any) => [p.id, p]));
    const result = pageProductIds
      .map((id: string) => {
        const p = productById.get(id);
        if (!p) return null;
        const summary = summaryByProductId.get(p.id) ?? null;
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          sku: p.sku ?? null,
          package_quantity: p.package_quantity ?? null,
          category: p.categories ?? null,
          prices: currentByProduct.get(p.id) ?? [],
          summary,
        };
      })
      .filter((p: any) => p !== null);

    // When filtering by supplier – hide products that don't have a price for that supplier
    const finalResult = supplierId 
      ? result.filter((p: any) => p.prices && p.prices.length > 0)
      : result;

    return res.json({
      products: finalResult,  // Already paginated by RPC
      total: totalCount,
      page,
      totalPages,  // Already calculated above
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single product
router.get('/:id', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const { id } = req.params;
    // לא משתמשים יותר ב-relationship ל-product_current_price כי אין קשר מוגדר בסכימה
    // טוענים רק את המוצר והקטגוריה, ואת המחירים הנוכחיים נטען בשאילה נפרדת למטה.
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories(id, name, default_margin_percent)
      `)
      .eq('tenant_id', tenant.tenantId)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    // Add current prices per supplier + summary
    const { data: current } = await supabase
      .from('product_supplier_current_price')
      .select('product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at')
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

    const { supplier_id, cost_price } = parsed.data;

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
    const finalMargin = await getGlobalMarginPercent(tenant.tenantId);
    const use_margin = await getUseMargin(tenant.tenantId);
    const use_vat = await getUseVat(tenant.tenantId);
    const discount_percent = parsed.data.discount_percent ?? 0;
    const cost_price_after_discount = calcCostAfterDiscount(cost_price, discount_percent);
    const sell_price = calcSellPrice({ 
      cost_price, 
      margin_percent: finalMargin, 
      vat_percent,
      cost_price_after_discount,
      use_margin,
      use_vat
    });

    const package_quantity = parsed.data.package_quantity ? round2(parsed.data.package_quantity) : null;
    
    const { data, error } = await supabase
      .from('price_entries')
      .insert({
        tenant_id: tenant.tenantId,
        product_id: productId,
        supplier_id,
        cost_price: round2(cost_price),
        discount_percent: round2(discount_percent),
        cost_price_after_discount: round2(cost_price_after_discount),
        margin_percent: round2(finalMargin),
        sell_price,
        package_quantity,
        created_by: user.id,
      })
      .select('id,product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at')
      .single();

    if (error) return res.status(400).json({ error: 'לא ניתן לשמור מחיר. נסה שוב.' });
    return res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Price history per product (+ optional supplier filter)
// Get price history for a product (optionally filtered by supplier)
router.get('/:id/price-history', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const productId = req.params.id;
    const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;

    let q = supabase
      .from('price_entries')
      .select('id,product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at')
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
    const { supplier_id, cost_price } = parsedPrice.data;

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

    const finalMargin = await getGlobalMarginPercent(tenant.tenantId);
    const use_margin = await getUseMargin(tenant.tenantId);
    const use_vat = await getUseVat(tenant.tenantId);
    const discount_percent = parsedPrice.data.discount_percent ?? 0;
    const cost_price_after_discount = calcCostAfterDiscount(cost_price, discount_percent);
    const sell_price = calcSellPrice({ 
      cost_price, 
      margin_percent: finalMargin, 
      vat_percent,
      cost_price_after_discount,
      use_margin,
      use_vat
    });

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
        sku: parsedProduct.data.sku?.trim() || null,
        package_quantity: parsedProduct.data.package_quantity ?? 1,
        is_active: true,
        created_by: user.id,
      })
      .select('id,name,category_id,unit,sku,package_quantity,created_at')
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
      discount_percent: round2(discount_percent),
      cost_price_after_discount: round2(cost_price_after_discount),
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
    if (parsed.data.sku !== undefined) patch.sku = parsed.data.sku?.trim() || null;
    if (parsed.data.package_quantity !== undefined) patch.package_quantity = parsed.data.package_quantity ?? 1;

    const { data, error } = await supabase
      .from('products')
      .update(patch)
      .eq('tenant_id', tenant.tenantId)
      .eq('id', id)
      .select('id,name,category_id,unit,sku,package_quantity,created_at')
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
