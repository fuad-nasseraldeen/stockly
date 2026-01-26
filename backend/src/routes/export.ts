import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';

const router = Router();

// Export current prices (CSV)
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
        created_at,
        products!inner(
          name,
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
    let csv = BOM + 'product_name,supplier,price,category,last_updated\n';

    for (const price of prices || []) {
      const product = price.products as any;
      const supplier = price.suppliers as any;
      const category = product.categories as any;
      const productName = (product.name || '').replace(/"/g, '""');
      const supplierName = (supplier.name || '').replace(/"/g, '""');
      const categoryName = (category?.name || 'כללי').replace(/"/g, '""');
      const costPrice = price.cost_price;
      const lastUpdated = new Date(price.created_at).toLocaleDateString('he-IL');

      csv += `"${productName}","${supplierName}",${costPrice},"${categoryName}","${lastUpdated}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="current_prices.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export current error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Export full history (CSV)
router.get('/history.csv', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;

    // Get all price entries with product, supplier, category info
    const { data: entries, error } = await supabase
      .from('price_entries')
      .select(`
        cost_price,
        created_at,
        products!inner(
          name,
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
    let csv = BOM + 'product_name,supplier,cost_price,created_at,category\n';

    for (const entry of entries || []) {
      const product = entry.products as any;
      const supplier = entry.suppliers as any;
      const category = product.categories as any;
      const productName = (product.name || '').replace(/"/g, '""');
      const supplierName = (supplier.name || '').replace(/"/g, '""');
      const categoryName = (category?.name || 'כללי').replace(/"/g, '""');
      const costPrice = entry.cost_price;
      const createdAt = new Date(entry.created_at).toISOString();

      csv += `"${productName}","${supplierName}",${costPrice},"${createdAt}","${categoryName}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="price_history.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export history error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

export default router;
