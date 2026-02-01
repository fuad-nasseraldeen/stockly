import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { normalizeName } from '../lib/normalize.js';

const router = Router();

// Export current prices (CSV) - with all new fields
router.get('/current.csv', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;

    // Get current prices with product, supplier, category info
    const { data: prices, error } = await supabase
      .from('product_supplier_current_price')
      .select(`
        product_id,
        supplier_id,
        cost_price,
        discount_percent,
        cost_price_after_discount,
        margin_percent,
        sell_price,
        created_at,
        products!inner(
          name,
          sku,
          package_quantity,
          categories(name)
        ),
        suppliers!inner(name)
      `)
      .eq('tenant_id', tenant.tenantId)
      .order('products(name)', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
    }

    // Format CSV with UTF-8 BOM for Excel Hebrew support
    const BOM = '\uFEFF';
    let csv = BOM + 'product_name,sku,package_quantity,supplier,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,category,last_updated\n';

    for (const price of prices || []) {
      const product = price.products as any;
      const supplier = price.suppliers as any;
      const category = product.categories as any;
      const productName = (product.name || '').replace(/"/g, '""');
      const sku = (product.sku || '').replace(/"/g, '""');
      const packageQuantity = product.package_quantity || '';
      const supplierName = (supplier.name || '').replace(/"/g, '""');
      const categoryName = (category?.name || 'כללי').replace(/"/g, '""');
      const costPrice = price.cost_price || '';
      const discountPercent = price.discount_percent || 0;
      const costPriceAfterDiscount = price.cost_price_after_discount || '';
      const marginPercent = price.margin_percent || '';
      const sellPrice = price.sell_price || '';
      const lastUpdated = new Date(price.created_at).toLocaleDateString('he-IL');

      csv += `"${productName}","${sku}",${packageQuantity},"${supplierName}",${costPrice},${discountPercent},${costPriceAfterDiscount},${marginPercent},${sellPrice},"${categoryName}","${lastUpdated}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="current_prices.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export current error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Export full history (CSV) - with all new fields
router.get('/history.csv', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;

    // Get all price entries with product, supplier, category info
    const { data: entries, error } = await supabase
      .from('price_entries')
      .select(`
        cost_price,
        discount_percent,
        cost_price_after_discount,
        margin_percent,
        sell_price,
        created_at,
        products!inner(
          name,
          sku,
          package_quantity,
          categories(name)
        ),
        suppliers!inner(name)
      `)
      .eq('tenant_id', tenant.tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
    }

    // Format CSV with UTF-8 BOM for Excel Hebrew support
    const BOM = '\uFEFF';
    let csv = BOM + 'product_name,sku,package_quantity,supplier,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,created_at,category\n';

    for (const entry of entries || []) {
      const product = entry.products as any;
      const supplier = entry.suppliers as any;
      const category = product.categories as any;
      const productName = (product.name || '').replace(/"/g, '""');
      const sku = (product.sku || '').replace(/"/g, '""');
      const packageQuantity = product.package_quantity || '';
      const supplierName = (supplier.name || '').replace(/"/g, '""');
      const categoryName = (category?.name || 'כללי').replace(/"/g, '""');
      const costPrice = entry.cost_price || '';
      const discountPercent = entry.discount_percent || 0;
      const costPriceAfterDiscount = entry.cost_price_after_discount || '';
      const marginPercent = entry.margin_percent || '';
      const sellPrice = entry.sell_price || '';
      const createdAt = new Date(entry.created_at).toISOString();

      csv += `"${productName}","${sku}",${packageQuantity},"${supplierName}",${costPrice},${discountPercent},${costPriceAfterDiscount},${marginPercent},${sellPrice},"${createdAt}","${categoryName}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="price_history.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export history error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Export filtered products (based on current view/filters)
router.get('/filtered.csv', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const { search, supplier_id, category_id, sort = 'updated_desc' } = req.query;

    // Build query similar to products endpoint
    let productIds: string[] | null = null;

    // If search provided, use fuzzy search
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      const searchNorm = normalizeName(searchTerm);

      // Try to find products by name or SKU - high limit for export
      const { data: searchResults, error: searchError } = await supabase
        .from('products')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('is_active', true)
        .or(`name_norm.ilike.%${searchNorm}%,sku.ilike.%${searchTerm}%`)
        .limit(10000); // High limit to get all matching products

      if (searchError) {
        console.error('Export filtered - search error:', searchError);
        // Continue without search filter if search fails
      } else if (searchResults && searchResults.length > 0) {
        productIds = searchResults.map(p => p.id);
      } else {
        // No results, return empty CSV
        const BOM = '\uFEFF';
        const csv = BOM + 'product_name,sku,package_quantity,supplier,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,category,last_updated\n';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
        return res.send(csv);
      }
    }

    // Build base query for products - NO LIMIT for export (we want all products)
    let productsQuery = supabase
      .from('products')
      .select('id, name, sku, package_quantity, category_id, categories(id, name)')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true)
      .limit(10000); // High limit to get all products

    if (productIds && productIds.length > 0) {
      productsQuery = productsQuery.in('id', productIds);
    }

    if (category_id && typeof category_id === 'string') {
      productsQuery = productsQuery.eq('category_id', category_id);
    }

    // Apply sorting
    if (sort === 'price_asc' || sort === 'price_desc') {
      // For price sorting, we'll need to join with price_summary
      // For now, just sort by name
      productsQuery = productsQuery.order('name', { ascending: true });
    } else if (sort === 'updated_asc' || sort === 'updated_desc') {
      // Products table has created_at, not updated_at
      productsQuery = productsQuery.order('created_at', { ascending: sort === 'updated_asc' });
    } else {
      // Default: sort by name
      productsQuery = productsQuery.order('name', { ascending: true });
    }

    const { data: products, error: productsError } = await productsQuery;

    if (productsError) {
      console.error('Export filtered - products query error:', productsError);
      return res.status(500).json({ error: 'שגיאה בטעינת מוצרים', details: productsError.message });
    }

    if (!products || products.length === 0) {
      const BOM = '\uFEFF';
      const csv = BOM + 'product_name,sku,package_quantity,supplier,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,category,last_updated\n';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
      return res.send(csv);
    }

    const productIdList = products.map(p => p.id);

    // Get current prices for these products - NO LIMIT for export (we want all prices)
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
        created_at,
        products!inner(
          name,
          sku,
          package_quantity,
          categories(name)
        ),
        suppliers!inner(name)
      `)
      .eq('tenant_id', tenant.tenantId)
      .in('product_id', productIdList)
      .limit(50000); // High limit to get all prices

    if (supplier_id && typeof supplier_id === 'string') {
      pricesQuery = pricesQuery.eq('supplier_id', supplier_id);
    }

    const { data: prices, error: pricesError } = await pricesQuery.order('products(name)', { ascending: true });

    if (pricesError) {
      return res.status(500).json({ error: 'שגיאה בטעינת מחירים' });
    }

    // Format CSV with UTF-8 BOM for Excel Hebrew support
    const BOM = '\uFEFF';
    let csv = BOM + 'product_name,sku,package_quantity,supplier,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,category,last_updated\n';

    for (const price of prices || []) {
      const product = price.products as any;
      const supplier = price.suppliers as any;
      const category = product.categories as any;
      const productName = (product.name || '').replace(/"/g, '""');
      const sku = (product.sku || '').replace(/"/g, '""');
      const packageQuantity = product.package_quantity || '';
      const supplierName = (supplier.name || '').replace(/"/g, '""');
      const categoryName = (category?.name || 'כללי').replace(/"/g, '""');
      const costPrice = price.cost_price || '';
      const discountPercent = price.discount_percent || 0;
      const costPriceAfterDiscount = price.cost_price_after_discount || '';
      const marginPercent = price.margin_percent || '';
      const sellPrice = price.sell_price || '';
      const lastUpdated = new Date(price.created_at).toLocaleDateString('he-IL');

      csv += `"${productName}","${sku}",${packageQuantity},"${supplierName}",${costPrice},${discountPercent},${costPriceAfterDiscount},${marginPercent},${sellPrice},"${categoryName}","${lastUpdated}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products_export.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export filtered error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
