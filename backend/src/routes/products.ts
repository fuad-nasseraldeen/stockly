import { Router } from 'express';
import { z } from 'zod';
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { normalizeName } from '../lib/normalize.js';
import { calcSellPrice, calcCostAfterDiscount, clampDecimalPrecision, roundToPrecision } from '../lib/pricing.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';

const router = Router();
const packageTypeSchema = z.enum(['carton', 'gallon', 'bag', 'bottle', 'pack', 'shrink', 'sachet', 'can', 'roll', 'unknown']);

// Performance debugging flag
const PERF_DEBUG = process.env.PERF_DEBUG === '1' || process.env.PERF_DEBUG === 'true';

// Helper to log performance metrics
function perfLog(correlationId: string, step: string, duration: number, metadata?: Record<string, any>) {
  if (!PERF_DEBUG) return;
  
  const metaStr = metadata 
    ? ' | ' + Object.entries(metadata)
        .map(([k, v]) => {
          // Avoid logging huge payloads - only counts/lengths
          if (Array.isArray(v)) return `${k}=${v.length}`;
          if (typeof v === 'object' && v !== null) {
            const keys = Object.keys(v);
            return `${k}=${keys.length}keys`;
          }
          return `${k}=${v}`;
        })
        .join(', ')
    : '';
  
  console.log(`[PERF ${correlationId}] ${step}: ${duration.toFixed(2)}ms${metaStr}`);
}

// Cache removed - RPC function handles pagination and sorting in DB, making cache unnecessary

const productSchema = z.object({
  name: z.string().trim().min(1, 'חובה להזין שם מוצר'),
  category_id: z.string().uuid().nullable().optional(),
  unit: z.enum(['unit', 'kg', 'liter']).optional(),
  sku: z.string().trim().optional().nullable(),
  // package_quantity removed - it's now only in price_entries (supplier-specific)
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
  package_type: packageTypeSchema.optional(),
  source_price_includes_vat: z.coerce.boolean().optional(),
  vat_rate: z.coerce.number().min(0).max(100).optional(),
  effective_from: z.string().trim().min(1).optional(),
});

const CURRENT_PRICE_SELECT_EXTENDED =
  'product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,package_type,source_price_includes_vat,vat_rate,effective_from,created_at';
const CURRENT_PRICE_SELECT_LEGACY =
  'product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at';
const PRODUCT_PRICE_SELECT_EXTENDED =
  'id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,package_type,source_price_includes_vat,vat_rate,effective_from,created_at';
const PRODUCT_PRICE_SELECT_LEGACY =
  'id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at';

function isMissingExtendedPriceColumns(error: any): boolean {
  const raw = String(error?.message || error || '').toLowerCase();
  if (!raw) return false;
  const mentionsNewColumn =
    raw.includes('package_type') ||
    raw.includes('source_price_includes_vat') ||
    raw.includes('vat_rate') ||
    raw.includes('effective_from');
  return mentionsNewColumn && (raw.includes('column') || raw.includes('does not exist') || raw.includes('schema cache'));
}

function applyExtendedPriceDefaults<T extends Record<string, any>>(rows: T[] | null | undefined): T[] {
  return (rows || []).map((row) => ({
    ...row,
    package_type: row.package_type ?? 'unknown',
    source_price_includes_vat: row.source_price_includes_vat ?? false,
    vat_rate: row.vat_rate ?? null,
    effective_from: row.effective_from ?? null,
  }));
}

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
  return Number(data?.global_margin_percent ?? 0);
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
  void tenantId;
  // use_vat is deprecated for runtime behavior: VAT mode is always enabled.
  return true;
}

async function getDecimalPrecision(tenantId: string): Promise<number> {
  const { data } = await supabase
    .from('settings')
    .select('decimal_precision')
    .eq('tenant_id', tenantId)
    .single();
  return clampDecimalPrecision((data as any)?.decimal_precision, 2);
}

async function getCategoryDefaultMargin(tenantId: string, categoryId: string | null | undefined): Promise<number> {
  if (!categoryId) {
    const { data: settings } = await supabase
      .from('settings')
      .select('global_margin_percent')
      .eq('tenant_id', tenantId)
      .single();
    return Number(settings?.global_margin_percent ?? 0);
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
    return Number(settings?.global_margin_percent ?? 0);
  }
  return Number(data.default_margin_percent ?? 0);
}

// Get all products
router.get('/', requireAuth, requireTenant, async (req, res) => {
  const t0 = performance.now();
  const requestIdHeader = (req.headers['x-request-id'] ?? req.headers['x-requestid']) as string | undefined;
  const requestId = (typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0)
    ? requestIdHeader.trim()
    : randomUUID();
  res.setHeader('x-request-id', requestId);

  // Perf state (so we can log a summary even on early returns via res.on('finish'))
  const perfState = {
    method: req.method,
    path: req.path,
    all: false as boolean,
    page: 0 as number,
    pageSize: 0 as number,
    rowsCount: 0 as number,
    totalCount: 0 as number,
    payloadBytes: 0 as number,
    supabaseMs: 0 as number, // Only time waiting for Supabase network calls (sum)
    transformMs: 0 as number,
    stringifyMs: 0 as number,
    extraQueriesCount: 0 as number,
    extraQueriesTotalMs: 0 as number,
  };

  // Always attach finish listener; but it logs only when PERF_DEBUG enabled.
  res.on('finish', () => {
    if (!PERF_DEBUG) return;
    const totalMs = performance.now() - t0;
    const payloadKB = perfState.payloadBytes > 0 ? perfState.payloadBytes / 1024 : 0;
    console.log(
      `[PERF ${requestId}] summary` +
        ` | totalMs=${totalMs.toFixed(2)}` +
        ` supabaseMs=${perfState.supabaseMs.toFixed(2)}` +
        ` transformMs=${perfState.transformMs.toFixed(2)}` +
        ` stringifyMs=${perfState.stringifyMs.toFixed(2)}` +
        ` extraQueriesCount=${perfState.extraQueriesCount}` +
        ` extraQueriesTotalMs=${perfState.extraQueriesTotalMs.toFixed(2)}` +
        ` rowsCount=${perfState.rowsCount}` +
        ` total=${perfState.totalCount}` +
        ` payloadKB=${payloadKB.toFixed(2)}` +
        ` all=${perfState.all}` +
        ` page=${perfState.page}` +
        ` pageSize=${perfState.pageSize}`
    );
  });

  if (PERF_DEBUG) console.log(`[PERF ${requestId}] start`);

  try {
    // after-auth/tenant-resolution (middleware already ran; measure handler entry overhead)
    const tAfterAuth = performance.now();
    const tenant = (req as any).tenant;
    perfLog(requestId, 'after_auth_tenant_resolution', tAfterAuth - t0, {
      tenantId: tenant?.tenantId,
    });

    // Query building time
    const queryBuildStart = performance.now();
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;
    const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updated_desc';
    
    // Check if requesting all products (for export)
    const all = req.query.all === 'true' || req.query.all === '1';
    perfState.all = all;
    
    // Pagination parameters
    // If all=true, fetch all products (use large pageSize, ignore page)
    const page = all ? 1 : Math.max(1, parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10));
    const pageSize = all 
      ? 10000 // Large page size to get all products in one request
      : Math.min(100, Math.max(1, parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '10', 10)));
    // (offset used in RPC params)
    const offset = (page - 1) * pageSize;
    perfState.page = page;
    perfState.pageSize = pageSize;

    // Step 1: determine which product IDs match (fuzzy search when search term exists)
    // OPTIMIZED: Use RPC function to get paginated product IDs with total count
    // This pushes sorting and pagination to the database - MUCH faster!
    const searchNormalized = search && search.trim() ? normalizeName(search.trim()) : null;
    
    const queryBuildTime = performance.now() - queryBuildStart;
    perfLog(requestId, 'after_params_buildQuery', queryBuildTime, {
      all,
      page,
      pageSize,
      hasSearch: !!search,
      hasSupplierFilter: !!supplierId,
      hasCategoryFilter: !!categoryId,
    });
    
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
    
    // RPC call timing
    const rpcStart = performance.now();
    const { data: pageData, error: rpcError } = await supabase.rpc('products_list_page', {
      tenant_uuid: tenant.tenantId,
      search_text: searchNormalized,
      supplier_uuid: supplierId || null,
      category_uuid: categoryId || null,
      sort_text: sort,
      limit_results: pageSize,
      offset_results: (page - 1) * pageSize,
    });
    const rpcTime = performance.now() - rpcStart;
    perfState.supabaseMs += rpcTime;
    perfLog(requestId, 'after_supabase_call:rpc(products_list_page)', rpcTime, {
      resultCount: pageData?.length || 0,
      error: rpcError ? 'yes' : 'no',
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
      perfState.rowsCount = 0;
      perfState.totalCount = 0;
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
    perfState.totalCount = Number(totalCount) || 0;

    // Track all extra queries (to detect N+1)
    const extraQueriesStart = performance.now();
    let extraQueriesCount = 0;
    let extraQueriesTotalTime = 0;

    // Now load details ONLY for the products on this page
    const productsQueryStart = performance.now();
    const { data: pageProducts, error: productsErr } = await supabase
      .from('products')
      .select('id,name,category_id,unit,sku,created_at,categories(id,name,default_margin_percent)')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true)
      .in('id', pageProductIds);
    const productsQueryTime = performance.now() - productsQueryStart;
    extraQueriesCount++;
    extraQueriesTotalTime += productsQueryTime;
    perfState.supabaseMs += productsQueryTime;
    perfLog(requestId, 'after_supabase_call:products', productsQueryTime, {
      productIdsCount: pageProductIds.length,
      productsReturned: pageProducts?.length || 0,
    });
    
    if (productsErr) return res.status(500).json({ error: 'שגיאה בטעינת מוצרים' });

    if (!pageProducts || pageProducts.length === 0) {
      perfState.rowsCount = 0;
      return res.json({ 
        products: [], 
        total: totalCount, 
        page, 
        totalPages 
      });
    }

    // Load prices ONLY for page products
    const pricesQueryStart = performance.now();
    let currentQ = supabase
      .from('product_supplier_current_price')
      // NOTE: product_id is needed here only for grouping; it will NOT be sent back in the JSON payload
      .select(CURRENT_PRICE_SELECT_EXTENDED)
      .eq('tenant_id', tenant.tenantId)
      .in('product_id', pageProductIds);

    if (supplierId) currentQ = currentQ.eq('supplier_id', supplierId);

    let { data: currentRows, error: currentErr } = await currentQ;
    if (currentErr && isMissingExtendedPriceColumns(currentErr)) {
      let fallbackQ = supabase
        .from('product_supplier_current_price')
        .select(CURRENT_PRICE_SELECT_LEGACY)
        .eq('tenant_id', tenant.tenantId)
        .in('product_id', pageProductIds);
      if (supplierId) fallbackQ = fallbackQ.eq('supplier_id', supplierId);
      const fallback = await fallbackQ;
      currentRows = applyExtendedPriceDefaults(fallback.data as any[]);
      currentErr = fallback.error;
    } else {
      currentRows = applyExtendedPriceDefaults(currentRows as any[]);
    }
    const pricesQueryTime = performance.now() - pricesQueryStart;
    extraQueriesCount++;
    extraQueriesTotalTime += pricesQueryTime;
    perfState.supabaseMs += pricesQueryTime;
    perfLog(requestId, 'after_supabase_call:prices', pricesQueryTime, {
      priceRowsReturned: currentRows?.length || 0,
    });
    if (currentErr) return res.status(500).json({ error: 'שגיאה בטעינת מחירים עדכניים' });

    // Suppliers for the current rows (to show names)
    const supplierIds = Array.from(new Set((currentRows ?? []).map((r: any) => r.supplier_id)));
    const suppliersQueryStart = performance.now();
    const { data: suppliers } =
      supplierIds.length > 0
        ? await supabase
            .from('suppliers')
            .select('id,name')
            .eq('tenant_id', tenant.tenantId)
            .in('id', supplierIds)
            .eq('is_active', true)
        : { data: [] as any[] };
    const suppliersQueryTime = performance.now() - suppliersQueryStart;
    if (supplierIds.length > 0) {
      extraQueriesCount++;
      extraQueriesTotalTime += suppliersQueryTime;
      perfState.supabaseMs += suppliersQueryTime;
    }
    perfLog(requestId, 'after_supabase_call:suppliers', suppliersQueryTime, {
      supplierIdsCount: supplierIds.length,
      suppliersReturned: suppliers?.length || 0,
    });
    const supplierNameById = new Map((suppliers ?? []).map((s: any) => [s.id, s.name]));

    const extraQueriesTime = performance.now() - extraQueriesStart;
    perfState.extraQueriesCount = extraQueriesCount;
    perfState.extraQueriesTotalMs = extraQueriesTotalTime;
    perfLog(requestId, 'extraQueries', extraQueriesTime, {
      queryCount: extraQueriesCount,
      avgQueryTime: extraQueriesCount > 0 ? (extraQueriesTotalTime / extraQueriesCount).toFixed(2) : 0,
    });

    // Transform/mapping time
    const transformStart = performance.now();
    
    // Group current prices by product, sort by lowest cost first (default)
    const currentByProduct = new Map<string, any[]>();
    for (const row of currentRows ?? []) {
      const {
        product_id,
        supplier_id,
        cost_price,
        discount_percent,
        cost_price_after_discount,
        margin_percent,
        sell_price,
        package_quantity,
        package_type,
        created_at,
      } = row as {
        product_id: string;
        supplier_id: string;
        cost_price: number;
        discount_percent: number | null;
        cost_price_after_discount: number | null;
        margin_percent: number | null;
        sell_price: number;
        package_quantity: number | null;
        package_type?: string | null;
        created_at: string;
      };

      const list = currentByProduct.get(product_id) ?? [];
      list.push({
        supplier_id,
        cost_price,
        discount_percent,
        cost_price_after_discount,
        margin_percent,
        sell_price,
        package_quantity,
        package_type: package_type ?? 'unknown',
        created_at,
        supplier_name: supplierNameById.get(supplier_id) ?? null,
      });
      currentByProduct.set(product_id, list);
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
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          sku: p.sku ?? null,
          package_quantity: p.package_quantity ?? null,
          category: p.categories ?? null,
          prices: currentByProduct.get(p.id) ?? [],
        };
      }) 
      .filter((p: any) => p !== null);

    // When filtering by supplier – hide products that don't have a price for that supplier
    const finalResult = supplierId 
      ? result.filter((p: any) => p.prices && p.prices.length > 0)
      : result;

    const transformTime = performance.now() - transformStart;
    perfState.transformMs = transformTime;
    perfLog(requestId, 'after_transform_mapping', transformTime, {
      resultCount: finalResult.length,
      productsProcessed: pageProducts.length,
    });
    perfState.rowsCount = finalResult.length;

    // JSON serialization time
    const jsonResponse = {
      products: finalResult,  // Already paginated by RPC
      total: totalCount,
      page,
      totalPages,  // Already calculated above
    };
    if (PERF_DEBUG) {
      const stringifyStart = performance.now();
      const jsonString = JSON.stringify(jsonResponse);
      const stringifyMs = performance.now() - stringifyStart;
      perfState.stringifyMs = stringifyMs;
      perfState.payloadBytes = jsonString.length;
      perfLog(requestId, 'after_stringify', stringifyMs, {
        payloadBytes: jsonString.length,
        payloadKB: (jsonString.length / 1024).toFixed(2),
      });
    }

    if (PERF_DEBUG) perfLog(requestId, 'sent', performance.now() - t0);
    res.json(jsonResponse);
  } catch (error: any) {
    if (PERF_DEBUG) perfLog(requestId, 'error', performance.now() - t0, { error: String(error) });
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
    // Get latest price entry for each supplier (with id for edit/delete)
    let { data: priceEntries, error: priceEntriesError } = await supabase
      .from('price_entries')
      .select(PRODUCT_PRICE_SELECT_EXTENDED)
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', id)
      .order('created_at', { ascending: false });
    if (priceEntriesError && isMissingExtendedPriceColumns(priceEntriesError)) {
      const fallback = await supabase
        .from('price_entries')
        .select(PRODUCT_PRICE_SELECT_LEGACY)
        .eq('tenant_id', tenant.tenantId)
        .eq('product_id', id)
        .order('created_at', { ascending: false });
      priceEntries = applyExtendedPriceDefaults(fallback.data as any[]);
      priceEntriesError = fallback.error;
    } else {
      priceEntries = applyExtendedPriceDefaults(priceEntries as any[]);
    }
    if (priceEntriesError) throw priceEntriesError;
    
    // Get the latest price entry for each supplier
    const latestBySupplier = new Map<string, any>();
    (priceEntries ?? []).forEach((entry: any) => {
      if (!latestBySupplier.has(entry.supplier_id)) {
        latestBySupplier.set(entry.supplier_id, entry);
      }
    });
    
    const current = Array.from(latestBySupplier.values());

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

    res.json({ ...data, prices });
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
    const decimalPrecision = await getDecimalPrecision(tenant.tenantId);
    const discount_percent = parsed.data.discount_percent ?? 0;
    const roundedCostPrice = roundToPrecision(cost_price, decimalPrecision);
    const roundedDiscount = roundToPrecision(discount_percent, decimalPrecision);
    const roundedMargin = roundToPrecision(finalMargin, decimalPrecision);
    const cost_price_after_discount = calcCostAfterDiscount(roundedCostPrice, roundedDiscount, decimalPrecision);
    const sell_price = calcSellPrice({ 
      cost_price: roundedCostPrice, 
      margin_percent: roundedMargin, 
      vat_percent,
      cost_price_after_discount,
      use_margin,
      use_vat,
      precision: decimalPrecision,
    });

    const package_quantity = parsed.data.package_quantity ? roundToPrecision(parsed.data.package_quantity, decimalPrecision) : null;
    
    const { data, error } = await supabase
      .from('price_entries')
      .insert({
        tenant_id: tenant.tenantId,
        product_id: productId,
        supplier_id,
        cost_price: roundedCostPrice,
        discount_percent: roundedDiscount,
        cost_price_after_discount: roundToPrecision(cost_price_after_discount, decimalPrecision),
        margin_percent: roundedMargin,
        sell_price,
        package_quantity,
        package_type: parsed.data.package_type ?? 'unknown',
        source_price_includes_vat: parsed.data.source_price_includes_vat ?? false,
        vat_rate: parsed.data.vat_rate ?? null,
        effective_from: parsed.data.effective_from ?? null,
        created_by: user.id,
      })
      .select('id,product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,package_type,source_price_includes_vat,vat_rate,effective_from,created_at')
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

    const normalizeHistoryRows = (rows: Array<Record<string, any>> | null | undefined) =>
      applyExtendedPriceDefaults(rows).map((row) => ({
        ...row,
        supplier_name: row.supplier_name ?? row.suppliers?.name ?? null,
      }));

    let qExtended = supabase
      .from('price_entries')
      .select(
        'id,product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,package_type,source_price_includes_vat,vat_rate,effective_from,created_at,suppliers(name)',
      )
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (supplierId) qExtended = qExtended.eq('supplier_id', supplierId);

    const extendedRes = await qExtended;
    if (!extendedRes.error) {
      return res.json(normalizeHistoryRows(extendedRes.data as Array<Record<string, any>>));
    }

    if (!isMissingExtendedPriceColumns(extendedRes.error)) {
      return res.status(500).json({ error: 'שגיאה בטעינת היסטוריית מחירים' });
    }

    let qLegacy = supabase
      .from('price_entries')
      .select('id,product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at,suppliers(name)')
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (supplierId) qLegacy = qLegacy.eq('supplier_id', supplierId);

    const legacyRes = await qLegacy;
    if (legacyRes.error) return res.status(500).json({ error: 'שגיאה בטעינת היסטוריית מחירים' });
    return res.json(normalizeHistoryRows(legacyRes.data as Array<Record<string, any>>));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a price entry (creates a new entry to keep history)
router.put('/:id/prices/:priceId', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const productId = req.params.id;
    const priceId = req.params.priceId;
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

    // Validate price entry exists and belongs to this product and tenant.
    // Fallback: if stale/missing priceId came from UI, resolve latest by product+supplier.
    let effectivePriceId = String(priceId || '').trim();
    if (!effectivePriceId || effectivePriceId === 'undefined' || effectivePriceId === 'null') {
      const latestBySupplier = await supabase
        .from('price_entries')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('product_id', productId)
        .eq('supplier_id', supplier_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestBySupplier.error || !latestBySupplier.data?.id) {
        return res.status(404).json({ error: 'המחיר לא נמצא' });
      }
      effectivePriceId = latestBySupplier.data.id;
    }

    const priceCheck = await supabase
      .from('price_entries')
      .select('id,product_id,supplier_id')
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', productId)
      .eq('id', effectivePriceId)
      .single();
    if (priceCheck.error || !priceCheck.data) {
      const latestBySupplier = await supabase
        .from('price_entries')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('product_id', productId)
        .eq('supplier_id', supplier_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestBySupplier.error || !latestBySupplier.data?.id) {
        return res.status(404).json({ error: 'המחיר לא נמצא' });
      }
      effectivePriceId = latestBySupplier.data.id;
    }

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
    const decimalPrecision = await getDecimalPrecision(tenant.tenantId);
    const discount_percent = parsed.data.discount_percent ?? 0;
    const roundedCostPrice = roundToPrecision(cost_price, decimalPrecision);
    const roundedDiscount = roundToPrecision(discount_percent, decimalPrecision);
    const roundedMargin = roundToPrecision(finalMargin, decimalPrecision);
    const cost_price_after_discount = calcCostAfterDiscount(roundedCostPrice, roundedDiscount, decimalPrecision);
    const sell_price = calcSellPrice({ 
      cost_price: roundedCostPrice, 
      margin_percent: roundedMargin, 
      vat_percent,
      cost_price_after_discount,
      use_margin,
      use_vat,
      precision: decimalPrecision,
    });

    const package_quantity = parsed.data.package_quantity ? roundToPrecision(parsed.data.package_quantity, decimalPrecision) : null;
    
    // Create a new price entry (keeps history)
    const { data, error } = await supabase
      .from('price_entries')
      .insert({
        tenant_id: tenant.tenantId,
        product_id: productId,
        supplier_id,
        cost_price: roundedCostPrice,
        discount_percent: roundedDiscount,
        cost_price_after_discount: roundToPrecision(cost_price_after_discount, decimalPrecision),
        margin_percent: roundedMargin,
        sell_price,
        package_quantity,
        package_type: parsed.data.package_type ?? 'unknown',
        source_price_includes_vat: parsed.data.source_price_includes_vat ?? false,
        vat_rate: parsed.data.vat_rate ?? null,
        effective_from: parsed.data.effective_from ?? null,
        created_by: user.id,
      })
      .select('id,product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,package_type,source_price_includes_vat,vat_rate,effective_from,created_at')
      .single();

    if (error) return res.status(400).json({ error: 'לא ניתן לעדכן מחיר. נסה שוב.' });
    return res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all price entries for a supplier-product combination
router.delete('/:id/prices/supplier/:supplierId', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const productId = req.params.id;
    const supplierId = req.params.supplierId;

    // Validate product exists and active
    const prodCheck = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('id', productId)
      .eq('is_active', true)
      .single();
    if (prodCheck.error || !prodCheck.data) return res.status(404).json({ error: 'המוצר לא נמצא' });

    // Validate supplier exists and active
    const supplierCheck = await supabase
      .from('suppliers')
      .select('id,name')
      .eq('tenant_id', tenant.tenantId)
      .eq('id', supplierId)
      .eq('is_active', true)
      .single();
    if (supplierCheck.error || !supplierCheck.data) return res.status(404).json({ error: 'הספק לא נמצא' });

    // Count entries before deletion
    const { count: countBefore } = await supabase
      .from('price_entries')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', productId)
      .eq('supplier_id', supplierId);

    // Delete all price entries for this supplier-product combination
    const { error } = await supabase
      .from('price_entries')
      .delete()
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', productId)
      .eq('supplier_id', supplierId);

    if (error) return res.status(400).json({ error: 'לא ניתן למחוק מחירים. נסה שוב.' });
    return res.status(200).json({ 
      message: `כל המחירים של הספק "${supplierCheck.data.name}" נמחקו בהצלחה`,
      deleted_count: countBefore || 0
    });
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
    const decimalPrecision = await getDecimalPrecision(tenant.tenantId);
    const discount_percent = parsedPrice.data.discount_percent ?? 0;
    const roundedCostPrice = roundToPrecision(cost_price, decimalPrecision);
    const roundedDiscount = roundToPrecision(discount_percent, decimalPrecision);
    const roundedMargin = roundToPrecision(finalMargin, decimalPrecision);
    const cost_price_after_discount = calcCostAfterDiscount(roundedCostPrice, roundedDiscount, decimalPrecision);
    const sell_price = calcSellPrice({ 
      cost_price: roundedCostPrice, 
      margin_percent: roundedMargin, 
      vat_percent,
      cost_price_after_discount,
      use_margin,
      use_vat,
      precision: decimalPrecision,
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
        // package_quantity removed - it's now only in price_entries (supplier-specific)
        is_active: true,
        created_by: user.id,
      })
      .select('id,name,category_id,unit,sku,created_at')
      .single();

    if (prodErr || !product) {
      return res.status(409).json({ error: 'מוצר בשם הזה כבר קיים בקטגוריה' });
    }

    // Then create price entry (history)
    const package_quantity = parsedPrice.data.package_quantity ? roundToPrecision(parsedPrice.data.package_quantity, decimalPrecision) : null;
    const { error: priceErr } = await supabase.from('price_entries').insert({
      tenant_id: tenant.tenantId,
      product_id: product.id,
      supplier_id,
      cost_price: roundedCostPrice,
      discount_percent: roundedDiscount,
      cost_price_after_discount: roundToPrecision(cost_price_after_discount, decimalPrecision),
      margin_percent: roundedMargin,
      sell_price,
      package_quantity,
      package_type: parsedPrice.data.package_type ?? 'unknown',
      source_price_includes_vat: parsedPrice.data.source_price_includes_vat ?? false,
      vat_rate: parsedPrice.data.vat_rate ?? null,
      effective_from: parsedPrice.data.effective_from ?? null,
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
    // package_quantity removed - it's now only in price_entries (supplier-specific)

    const { data, error } = await supabase
      .from('products')
      .update(patch)
      .eq('tenant_id', tenant.tenantId)
      .eq('id', id)
      .select('id,name,category_id,unit,sku,created_at')
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
