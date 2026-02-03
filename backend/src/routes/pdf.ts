import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { normalizeName } from '../lib/normalize.js';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

const router = Router();

/**
 * Reuse a single Chromium instance across requests to avoid the high startup cost
 * of launching a browser for every PDF generation.
 * Uses puppeteer-core + @sparticuz/chromium for both Vercel and local environments.
 */
let sharedBrowser: any = null;
let sharedBrowserLaunching: Promise<any> | null = null;

async function launchBrowser(): Promise<any> {
  // STRICT: Use ONLY puppeteer-core + @sparticuz/chromium-min
  // NO fallbacks, NO hardcoded paths, NO system chromium
  
  // Get executable path from @sparticuz/chromium-min (ONLY source, NO fallbacks)
  const executablePath = await chromium.executablePath();
  
  // CRITICAL: Throw immediately if executablePath is empty or invalid
  if (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '') {
    throw new Error(
      'Sparticuz chromium-min executablePath() returned empty. ' +
      'This means @sparticuz/chromium-min is not properly installed or packaged. ' +
      'Ensure: 1) @sparticuz/chromium-min is in dependencies (not devDependencies), ' +
      '2) npm install completed successfully, ' +
      '3) Vercel includes node_modules/@sparticuz/chromium-min in function bundle.'
    );
  }

  // CRITICAL: Reject /tmp/chromium (this indicates @sparticuz/chromium-min failed)
  if (executablePath === '/tmp/chromium' || executablePath.includes('/tmp/chromium')) {
    throw new Error(
      `@sparticuz/chromium-min.executablePath() returned invalid path: ${executablePath}. ` +
      'This indicates the package is not properly installed or Vercel is not bundling it correctly. ' +
      'Check: 1) @sparticuz/chromium-min is in dependencies, ' +
      '2) next.config.js includes @sparticuz/chromium-min in outputFileTracingIncludes (for Next.js) or vercel.json includes it (for Express), ' +
      '3) Function runs in Node.js runtime (not Edge).'
    );
  }

  // Temporary diagnostic log (ALWAYS log executablePath to verify it's NOT /tmp/chromium)
  // This will help us confirm the fix works
  console.log('[PDF] Resolved executablePath from @sparticuz/chromium-min:', executablePath);
  console.log('[PDF] Path is valid (not /tmp/chromium):', !executablePath.includes('/tmp/chromium'));
  
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PDF) {
    console.log('[PDF Debug] Args count:', chromium.args?.length || 0);
    console.log('[PDF Debug] Headless:', chromium.headless);
    console.log('[PDF Debug] DefaultViewport:', chromium.defaultViewport);
  }

  // Launch with strict options from @sparticuz/chromium-min
  return await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
    defaultViewport: chromium.defaultViewport,
  });
}

async function getSharedBrowser(): Promise<any> {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  if (sharedBrowserLaunching) return sharedBrowserLaunching;

  sharedBrowserLaunching = launchBrowser()
    .then((b) => {
      sharedBrowser = b;
      return b;
    })
    .finally(() => {
      sharedBrowserLaunching = null;
    });

  return sharedBrowserLaunching;
}

/**
 * Generate PDF for products table
 */
router.get('/products.pdf', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const { search, supplier_id, category_id, sort = 'updated_desc' } = req.query;

    // Get tenant name
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenant.tenantId)
      .single();

    const tenantName = tenantData?.name || 'חנות';

    // Get settings
    const { data: settings } = await supabase
      .from('settings')
      .select('use_vat, use_margin, vat_percent, global_margin_percent')
      .eq('tenant_id', tenant.tenantId)
      .single();

    const useVat = settings?.use_vat === true;
    const useMargin = settings?.use_margin === true;
    const vatPercent = settings?.vat_percent ?? 18;

    // Get column layout
    const { data: layoutData } = await supabase
      .from('user_preferences')
      .select('value')
      .eq('tenant_id', tenant.tenantId)
      .eq('key', 'table_layout_productsTable')
      .single();

    let layout = null;
    if (layoutData?.value) {
      try {
        layout = typeof layoutData.value === 'string' ? JSON.parse(layoutData.value) : layoutData.value;
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    // Fetch products data (similar to export route)
    let productIds: string[] | null = null;

    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      const searchNorm = normalizeName(searchTerm);

      const { data: searchResults } = await supabase
        .from('products')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('is_active', true)
        .or(`name_norm.ilike.%${searchNorm}%,sku.ilike.%${searchTerm}%`)
        .limit(10000);

      if (searchResults && searchResults.length > 0) {
        productIds = searchResults.map(p => p.id);
      } else {
        // No results - return empty PDF
        const html = generateProductsHTML(tenantName, [], layout, { useVat, useMargin, vatPercent });
        const pdf = await generatePDF(html);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="products.pdf"');
        return res.send(pdf);
      }
    }

    // Get products
    let productsQuery = supabase
      .from('products')
      .select('id, name, sku')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true)
      .limit(10000);

    if (productIds && productIds.length > 0) {
      productsQuery = productsQuery.in('id', productIds);
    }

    if (category_id && typeof category_id === 'string') {
      productsQuery = productsQuery.eq('category_id', category_id);
    }

    const { data: products } = await productsQuery;

    if (!products || products.length === 0) {
      const html = generateProductsHTML(tenantName, [], layout, { useVat, useMargin, vatPercent });
      const pdf = await generatePDF(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="products.pdf"');
      return res.send(pdf);
    }

    const productIdList = products.map(p => p.id);
    
    // Create a map of product_id to sku for quick lookup
    const productSkuMap = new Map<string, string | null>();
    products.forEach((p: any) => {
      productSkuMap.set(p.id, p.sku || null);
    });

    // Get prices
    let pricesQuery = supabase
      .from('product_supplier_current_price')
      .select(`
        product_id,
        supplier_id,
        cost_price,
        discount_percent,
        cost_price_after_discount,
        margin_percent,
        sell_price,
        package_quantity,
        created_at,
        products!inner(name),
        suppliers!inner(name)
      `)
      .eq('tenant_id', tenant.tenantId)
      .in('product_id', productIdList)
      .limit(50000);

    if (supplier_id && typeof supplier_id === 'string') {
      pricesQuery = pricesQuery.eq('supplier_id', supplier_id);
    }

    const { data: prices } = await pricesQuery.order('products(name)', { ascending: true });

    // Transform prices for PDF
    const priceData = (prices || []).map((price: any) => ({
      cost_price: price.cost_price,
      cost_price_after_discount: price.cost_price_after_discount,
      discount_percent: price.discount_percent,
      package_quantity: price.package_quantity,
      sell_price: price.sell_price,
      margin_percent: price.margin_percent,
      supplier_id: price.supplier_id,
      supplier_name: price.suppliers?.name || 'לא ידוע',
      created_at: price.created_at,
      product_name: price.products?.name || '',
      product_sku: productSkuMap.get(price.product_id) || null,
    }));

    const html = generateProductsHTML(tenantName, priceData, layout, { useVat, useMargin, vatPercent });
    const pdf = await generatePDF(html);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="products.pdf"');
    res.send(pdf);
  } catch (error) {
    const err = error as any;
    const details = err?.message || String(error);
    console.error('PDF generation error (products):', details, err?.stack ? `\n${err.stack}` : '');

    res.status(500).json({
      error: 'שגיאה ביצירת PDF',
      details,
    });
  }
});

/**
 * Generate PDF for price history
 */
router.get('/price-history/:productId.pdf', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const productId = req.params.productId;
    const supplierId = typeof req.query.supplier_id === 'string' ? req.query.supplier_id : undefined;

    // Get tenant name
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenant.tenantId)
      .single();

    const tenantName = tenantData?.name || 'חנות';

    // Get product name
    const { data: productData } = await supabase
      .from('products')
      .select('name')
      .eq('id', productId)
      .eq('tenant_id', tenant.tenantId)
      .single();

    const productName = productData?.name || 'מוצר';

    // Get supplier name if filtered
    let supplierName = '';
    if (supplierId) {
      const { data: supplierData } = await supabase
        .from('suppliers')
        .select('name')
        .eq('id', supplierId)
        .eq('tenant_id', tenant.tenantId)
        .single();
      supplierName = supplierData?.name || '';
    }

    // Get settings
    const { data: settings } = await supabase
      .from('settings')
      .select('use_vat, use_margin, vat_percent, global_margin_percent')
      .eq('tenant_id', tenant.tenantId)
      .single();

    const useVat = settings?.use_vat === true;
    const useMargin = settings?.use_margin === true;
    const vatPercent = settings?.vat_percent ?? 18;

    // Get column layout
    const { data: layoutData } = await supabase
      .from('user_preferences')
      .select('value')
      .eq('tenant_id', tenant.tenantId)
      .eq('key', 'table_layout_priceHistoryTable')
      .single();

    let layout = null;
    if (layoutData?.value) {
      try {
        layout = typeof layoutData.value === 'string' ? JSON.parse(layoutData.value) : layoutData.value;
      } catch (e) {
        // Invalid JSON, use defaults
      }
    }

    // Get price history
    let historyQuery = supabase
      .from('price_entries')
      .select('id,product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,created_at,suppliers!inner(name)')
      .eq('tenant_id', tenant.tenantId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (supplierId) {
      historyQuery = historyQuery.eq('supplier_id', supplierId);
    }

    const { data: history } = await historyQuery;

    // Transform history for PDF
    const historyData = (history || []).map((entry: any) => ({
      cost_price: entry.cost_price,
      cost_price_after_discount: entry.cost_price_after_discount,
      discount_percent: entry.discount_percent,
      package_quantity: entry.package_quantity,
      sell_price: entry.sell_price,
      margin_percent: entry.margin_percent,
      supplier_id: entry.supplier_id,
      supplier_name: entry.suppliers?.name || 'לא ידוע',
      created_at: entry.created_at,
    }));

    const subtitle = supplierName ? `מוצר: ${productName} • ספק: ${supplierName}` : `מוצר: ${productName}`;
    const html = generatePriceHistoryHTML(tenantName, subtitle, historyData, layout, { useVat, useMargin, vatPercent });
    const pdf = await generatePDF(html);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="price_history.pdf"');
    res.send(pdf);
  } catch (error) {
    const err = error as any;
    const details = err?.message || String(error);
    console.error('PDF generation error (price-history):', details, err?.stack ? `\n${err.stack}` : '');

    res.status(500).json({
      error: 'שגיאה ביצירת PDF',
      details,
    });
  }
});

/**
 * Generate HTML for products table
 */
function generateProductsHTML(
  tenantName: string,
  prices: any[],
  layout: any,
  settings: { useVat: boolean; useMargin: boolean; vatPercent: number }
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  const columns = getVisibleColumns(layout, settings);
  const hasMultipleProducts = new Set(prices.map((p: any) => p.product_name)).size > 1;
  const totalCount = prices.length;

  // Add numbering column at the beginning
  // Add product column if multiple products
  const displayColumns = hasMultipleProducts
    ? [{ id: '_number', headerLabel: '#' }, { id: 'product', headerLabel: 'מוצר' }, ...columns]
    : [{ id: '_number', headerLabel: '#' }, ...columns];

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 8px;
      margin: 0;
      padding: 0;
      width: 100%;
      overflow: hidden;
    }
    .header {
      margin-bottom: 6mm;
      border-bottom: 1px solid #000;
      padding-bottom: 2mm;
      width: 100%;
    }
    .tenant-name {
      font-size: 10pt;
      font-weight: bold;
      margin-bottom: 1mm;
      text-align: right;
    }
    .date-time {
      font-size: 7pt;
      color: #666;
      margin-bottom: 1mm;
      text-align: right;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1mm;
    }
    .title {
      font-size: 9pt;
      font-weight: bold;
    }
    .total-count {
      font-size: 7pt;
      color: #666;
      font-weight: normal;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 8px;
      margin: 0;
      padding: 0;
    }
    th, td {
      padding: 2px 3px;
      border: 0.5px solid #ddd;
      text-align: right;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: normal;
      vertical-align: top;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
      font-size: 8px;
    }
    td {
      font-size: 8px;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="tenant-name">${escapeHtml(tenantName)}</div>
    <div class="date-time">${dateStr} ${timeStr}</div>
    <div class="title-row">
      <div class="title">מוצרים</div>
      <div class="total-count">סך הכל: ${totalCount} מוצרים</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        ${displayColumns.map((col: any) => `<th>${escapeHtml(col.headerLabel)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${prices.length === 0 
        ? '<tr><td colspan="' + displayColumns.length + '">לא נמצאו מוצרים</td></tr>'
        : prices.map((price: any, index: number) => `
        <tr>
          ${displayColumns.map((col: any) => {
            if (col.id === '_number') {
              return `<td>${index + 1}</td>`;
            }
            if (col.id === 'product') {
              return `<td>${escapeHtml(price.product_name || '')}</td>`;
            }
            return `<td>${escapeHtml(renderCell(col, price, settings))}</td>`;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
  `;
}

/**
 * Generate HTML for price history table
 */
function generatePriceHistoryHTML(
  tenantName: string,
  subtitle: string,
  history: any[],
  layout: any,
  settings: { useVat: boolean; useMargin: boolean; vatPercent: number }
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  const columns = getVisibleColumns(layout, settings);
  const totalCount = history.length;
  
  // Add numbering column at the beginning
  const displayColumns = [{ id: '_number', headerLabel: '#' }, ...columns];

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 8px;
      margin: 0;
      padding: 0;
      width: 100%;
      overflow: hidden;
    }
    .header {
      margin-bottom: 6mm;
      border-bottom: 1px solid #000;
      padding-bottom: 2mm;
      width: 100%;
    }
    .tenant-name {
      font-size: 10pt;
      font-weight: bold;
      margin-bottom: 1mm;
      text-align: right;
    }
    .date-time {
      font-size: 7pt;
      color: #666;
      margin-bottom: 1mm;
      text-align: right;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1mm;
    }
    .title {
      font-size: 9pt;
      font-weight: bold;
    }
    .total-count {
      font-size: 7pt;
      color: #666;
      font-weight: normal;
    }
    .subtitle {
      font-size: 7pt;
      color: #666;
      margin-bottom: 2mm;
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 8px;
      margin: 0;
      padding: 0;
    }
    th, td {
      padding: 2px 3px;
      border: 0.5px solid #ddd;
      text-align: right;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: normal;
      vertical-align: top;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
      font-size: 8px;
    }
    td {
      font-size: 8px;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="tenant-name">${escapeHtml(tenantName)}</div>
    <div class="date-time">${dateStr} ${timeStr}</div>
    <div class="title-row">
      <div class="title">היסטוריית מחירים</div>
      <div class="total-count">סך הכל: ${totalCount} רשומות</div>
    </div>
    <div class="subtitle">${escapeHtml(subtitle)}</div>
  </div>
  <table>
    <thead>
      <tr>
        ${displayColumns.map((col: any) => `<th>${escapeHtml(col.headerLabel)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${history.length === 0 
        ? '<tr><td colspan="' + displayColumns.length + '">אין היסטוריית מחירים</td></tr>'
        : history.map((entry: any, index: number) => `
        <tr>
          ${displayColumns.map((col: any) => {
            if (col.id === '_number') {
              return `<td>${index + 1}</td>`;
            }
            return `<td>${escapeHtml(renderCell(col, entry, settings))}</td>`;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
  `;
}

/**
 * Get visible columns based on layout
 */
function getVisibleColumns(layout: any, settings: { useVat: boolean; useMargin: boolean }): any[] {
  const allColumns = [
    { id: 'supplier', headerLabel: 'ספק', requires: {} },
    { id: 'sku', headerLabel: 'מק"ט', requires: {} },
    { id: 'cost_gross', headerLabel: 'מחיר עלות (כולל מע"מ)', requires: {} },
    { id: 'cost_net', headerLabel: 'מחיר לפני מע"מ', requires: { vat: true } },
    { id: 'discount', headerLabel: 'הנחה', requires: {} },
    { id: 'cost_after_discount_gross', headerLabel: 'מחיר לאחר הנחה (כולל מע"מ)', requires: {} },
    { id: 'cost_after_discount_net', headerLabel: 'מחיר לאחר הנחה (לפני מע"מ)', requires: { vat: true } },
    { id: 'quantity_per_carton', headerLabel: 'כמות בקרטון', requires: {} },
    { id: 'carton_price', headerLabel: 'מחיר לקרטון', requires: {} },
    { id: 'sell_price', headerLabel: 'מחיר מכירה', requires: { margin: true } },
    { id: 'profit_amount', headerLabel: 'סכום רווח', requires: { margin: true } },
    { id: 'profit_percent', headerLabel: 'אחוז רווח', requires: { margin: true } },
    { id: 'date', headerLabel: 'תאריך עדכון', requires: {} },
  ];

  // Filter by requirements
  let available = allColumns.filter((col: any) => {
    if (col.requires.vat && !settings.useVat) return false;
    if (col.requires.margin && !settings.useMargin) return false;
    return true;
  });

  // Apply layout if available
  if (layout?.order && layout?.visible) {
    const order = layout.order;
    const visible = layout.visible;
    
    const ordered: any[] = [];
    const processed = new Set();
    
    for (const colId of order) {
      const col = available.find((c: any) => c.id === colId);
      if (col && visible[colId] !== false) {
        ordered.push(col);
        processed.add(colId);
      }
    }
    
    for (const col of available) {
      if (!processed.has(col.id) && visible[col.id] !== false) {
        ordered.push(col);
      }
    }
    
    return ordered;
  }

  return available;
}

/**
 * Render cell value
 */
function renderCell(col: any, price: any, settings: { useVat: boolean; vatPercent: number }): string {
  switch (col.id) {
    case 'supplier':
      return price.supplier_name || 'לא ידוע';
    case 'sku':
      return price.product_sku || '-';
    case 'cost_gross':
      return `₪${Number(price.cost_price || 0).toFixed(2)}`;
    case 'cost_net':
      if (!settings.useVat) return '-';
      const net = Number(price.cost_price || 0) / (1 + settings.vatPercent / 100);
      return `₪${net.toFixed(2)}`;
    case 'discount':
      return price.discount_percent && Number(price.discount_percent) > 0
        ? `${Number(price.discount_percent).toFixed(1)}%`
        : '-';
    case 'cost_after_discount_gross':
      const afterDiscount = Number(price.cost_price_after_discount || price.cost_price || 0);
      return `₪${afterDiscount.toFixed(2)}`;
    case 'cost_after_discount_net':
      if (!settings.useVat) return '-';
      const afterDiscountNet = Number(price.cost_price_after_discount || price.cost_price || 0) / (1 + settings.vatPercent / 100);
      return `₪${afterDiscountNet.toFixed(2)}`;
    case 'quantity_per_carton':
      return `${Number(price.package_quantity || 1)} יח'`;
    case 'carton_price':
      const cartonPrice = Number(price.cost_price_after_discount || price.cost_price || 0) * Number(price.package_quantity || 1);
      return `₪${cartonPrice.toFixed(2)}`;
    case 'sell_price':
      return price.sell_price ? `₪${Number(price.sell_price).toFixed(2)}` : '-';
    case 'profit_amount':
      if (!price.sell_price) return '-';
      const profit = Number(price.sell_price) - Number(price.cost_price_after_discount || price.cost_price || 0);
      return `₪${profit.toFixed(2)}`;
    case 'profit_percent':
      return price.margin_percent ? `${Number(price.margin_percent).toFixed(1)}%` : '-';
    case 'date':
      if (!price.created_at) return '-';
      return new Date(price.created_at).toLocaleDateString('he-IL');
    default:
      return '-';
  }
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generate PDF from HTML using Puppeteer-core + @sparticuz/chromium
 * This works in both Vercel serverless and local environments.
 */
async function generatePDF(html: string): Promise<Buffer> {
  const browser = await getSharedBrowser();
  const page = await browser.newPage();

  try {
    // Puppeteer uses 'networkidle0' (not 'networkidle' like Playwright)
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF with A4 settings
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm',
      },
      printBackground: false,
      preferCSSPageSize: true,
    });

    return Buffer.from(pdf);
  } catch (error) {
    const err = error as Error;
    throw new Error(
      `PDF generation failed: ${err.message}. ` +
      `Browser: puppeteer-core + @sparticuz/chromium. ` +
      `If this fails on Vercel, check function logs for executablePath diagnostic.`
    );
  } finally {
    // Always close the page; keep the browser alive for subsequent requests.
    await page.close().catch(() => undefined);
  }
}

export default router;
