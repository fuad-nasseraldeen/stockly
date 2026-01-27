import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant, ownerOnly } from '../middleware/auth.js';
import { normalizeName } from '../lib/normalize.js';
import { calcSellPrice } from '../lib/pricing.js';
import * as XLSX from 'xlsx';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const importModeSchema = z.enum(['merge', 'overwrite']);

interface ImportRow {
  product_name: string;
  supplier: string;
  price: number;
  category?: string;
}

// Parse Excel/CSV file
function parseFile(buffer: Buffer, mimetype: string): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];

  if (rows.length < 2) {
    throw new Error('הקובץ ריק או לא תקין');
  }

  // Find header row (look for product_name, supplier, price, category)
  let headerRowIndex = -1;
  const headerMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i] as any[];
    const lowerRow = row.map((cell: any) => String(cell || '').toLowerCase().trim());
    
    const productIdx = lowerRow.findIndex(c => c.includes('product') || c.includes('מוצר'));
    const supplierIdx = lowerRow.findIndex(c => c.includes('supplier') || c.includes('ספק'));
    const priceIdx = lowerRow.findIndex(c => c.includes('price') || c.includes('מחיר') || c.includes('cost'));
    const categoryIdx = lowerRow.findIndex(c => c.includes('category') || c.includes('קטגוריה'));

    if (productIdx >= 0 && supplierIdx >= 0 && priceIdx >= 0) {
      headerRowIndex = i;
      headerMap.product_name = productIdx;
      headerMap.supplier = supplierIdx;
      headerMap.price = priceIdx;
      if (categoryIdx >= 0) headerMap.category = categoryIdx;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error('לא נמצאו עמודות נדרשות: product_name, supplier, price');
  }

  // Parse data rows
  const data: ImportRow[] = [];
  const seen = new Map<string, ImportRow>(); // For deduplication: (product_name, supplier) -> last row

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || row.length === 0) continue;

    const productName = String(row[headerMap.product_name] || '').trim();
    const supplier = String(row[headerMap.supplier] || '').trim();
    const priceStr = String(row[headerMap.price] || '').trim();
    const category = headerMap.category !== undefined ? String(row[headerMap.category] || '').trim() : undefined;

    if (!productName || !supplier || !priceStr) continue;

    const price = parseFloat(priceStr.replace(/[^\d.]/g, ''));
    if (isNaN(price) || price < 0) continue;

    const key = `${productName.toLowerCase()}|${supplier.toLowerCase()}`;
    const importRow: ImportRow = {
      product_name: productName,
      supplier,
      price,
      category: category || undefined,
    };

    seen.set(key, importRow); // Keep last occurrence
  }

  return Array.from(seen.values());
}

// Preview import
router.post('/preview', requireAuth, requireTenant, upload.single('file'), async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'לא הועלה קובץ' });
    }

    // Parse file
    let rows: ImportRow[];
    try {
      rows = parseFile(file.buffer, file.mimetype);
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'שגיאה בפענוח הקובץ' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות נתונים תקינות' });
    }

    // Validate and normalize
    const preview: any[] = [];
    const errors: string[] = [];
    const suppliers = new Set<string>();
    const categories = new Set<string>();
    const products = new Set<string>();

    for (const row of rows) {
      suppliers.add(row.supplier.toLowerCase());
      if (row.category) categories.add(row.category.toLowerCase());
      products.add(normalizeName(row.product_name));

      preview.push({
        product_name: row.product_name,
        supplier: row.supplier,
        price: row.price,
        category: row.category || 'כללי',
      });
    }

    // Count existing data
    const { data: existingSuppliers } = await supabase
      .from('suppliers')
      .select('name')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true);

    const { data: existingCategories } = await supabase
      .from('categories')
      .select('name')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true);

    const { data: existingProducts } = await supabase
      .from('products')
      .select('name')
      .eq('tenant_id', tenant.tenantId)
      .eq('is_active', true);

    const existingSupplierNames = new Set((existingSuppliers || []).map((s: any) => s.name.toLowerCase()));
    const existingCategoryNames = new Set((existingCategories || []).map((c: any) => c.name.toLowerCase()));
    const existingProductNames = new Set((existingProducts || []).map((p: any) => normalizeName(p.name)));

    const newSuppliers = Array.from(suppliers).filter(s => !existingSupplierNames.has(s));
    const newCategories = Array.from(categories).filter(c => !existingCategoryNames.has(c) && c !== 'כללי');
    const newProducts = Array.from(products).filter(p => !existingProductNames.has(p));

    res.json({
      preview: preview.slice(0, 100), // Limit preview to 100 rows
      totalRows: rows.length,
      counts: {
        suppliers: { new: newSuppliers.length, existing: suppliers.size - newSuppliers.length },
        categories: { new: newCategories.length, existing: categories.size - newCategories.length },
        products: { new: newProducts.length, existing: products.size - newProducts.length },
        prices: rows.length,
      },
      errors: errors.slice(0, 50), // Limit errors
    });
  } catch (error) {
    console.error('Import preview error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// Apply import
router.post('/apply', requireAuth, requireTenant, upload.single('file'), async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const mode = importModeSchema.parse(req.query.mode || 'merge');
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'לא הועלה קובץ' });
    }

    // Parse file
    let rows: ImportRow[];
    try {
      rows = parseFile(file.buffer, file.mimetype);
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'שגיאה בפענוח הקובץ' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו שורות נתונים תקינות' });
    }

    // Get settings for VAT
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('vat_percent,global_margin_percent')
      .eq('tenant_id', tenant.tenantId)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
    }

    const vatPercent = settings?.vat_percent || 18;
    const globalMarginPercent = settings?.global_margin_percent ?? 30;

    // OVERWRITE mode: delete all tenant data
    if (mode === 'overwrite') {
      if (tenant.role !== 'owner') {
        return res.status(403).json({ error: 'פעולת overwrite זמינה לבעלים בלבד' });
      }

      // Delete in FK-safe order (using service role which bypasses RLS)
      await supabase.from('price_entries').delete().eq('tenant_id', tenant.tenantId);
      await supabase.from('products').delete().eq('tenant_id', tenant.tenantId);
      await supabase.from('suppliers').delete().eq('tenant_id', tenant.tenantId);
      await supabase.from('categories').delete().eq('tenant_id', tenant.tenantId).neq('name', 'כללי');
      await supabase.from('settings').delete().eq('tenant_id', tenant.tenantId);
      
      // Recreate defaults
      await supabase.from('settings').insert({
        tenant_id: tenant.tenantId,
        vat_percent: 18,
      });

      // Ensure default category exists (handle duplicates safely)
      const { data: defaultCategories, error: defaultCategoryCheckError } = await supabase
        .from('categories')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('name', 'כללי')
        .eq('is_active', true);

      if (defaultCategoryCheckError) {
        console.error('Error checking default category in overwrite mode:', defaultCategoryCheckError);
      }

      const defaultCategory = Array.isArray(defaultCategories) ? defaultCategories[0] : null;

      if (!defaultCategory) {
        const { error: insertError } = await supabase.from('categories').insert({
          tenant_id: tenant.tenantId,
          name: 'כללי',
          default_margin_percent: 0,
          is_active: true,
          created_by: user.id,
        });
        if (insertError) {
          console.error('Error creating default category in overwrite mode:', insertError);
        }
      }
    }

    // Process import
    const stats = {
      suppliersCreated: 0,
      categoriesCreated: 0,
      productsCreated: 0,
      pricesInserted: 0,
      pricesSkipped: 0,
    };

    // Get or create default category (handle duplicates safely)
    let defaultCategoryId: string;
    const { data: defaultCategories, error: defaultCategoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('name', 'כללי')
      .eq('is_active', true);

    if (defaultCategoryError) {
      console.error('Error fetching default category:', defaultCategoryError);
    }

    const defaultCategory = Array.isArray(defaultCategories) ? defaultCategories[0] : null;

    if (defaultCategory) {
      defaultCategoryId = defaultCategory.id;
    } else {
      const { data: newCategory, error: defaultCategoryInsertError } = await supabase
        .from('categories')
        .insert({
          tenant_id: tenant.tenantId,
          name: 'כללי',
          default_margin_percent: globalMarginPercent,
          is_active: true,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (!newCategory || defaultCategoryInsertError) {
        console.error('Failed to create default category during import:', defaultCategoryInsertError);
        throw new Error('שגיאה ביצירת קטגוריה כללית בעת ייבוא הנתונים');
      }

      defaultCategoryId = newCategory.id;
    }

    // Process each row
    for (const row of rows) {
      // Upsert supplier
      let supplierId: string;

      const { data: existingSupplier, error: supplierCheckError } = await supabase
        .from('suppliers')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('is_active', true)
        .ilike('name', row.supplier)
        .maybeSingle();

      if (existingSupplier && !supplierCheckError) {
        supplierId = existingSupplier.id;
      } else {
        const { data: newSupplier, error: supplierInsertError } = await supabase
          .from('suppliers')
          .insert({
            tenant_id: tenant.tenantId,
            name: row.supplier,
            is_active: true,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (!newSupplier || supplierInsertError) {
          console.error('Failed to create supplier during import, skipping row:', {
            row,
            error: supplierInsertError,
          });
          stats.pricesSkipped++;
          continue;
        }

        supplierId = newSupplier.id;
        stats.suppliersCreated++;
      }

      // Upsert category
      const categoryName = row.category || 'כללי';
      let categoryId: string = defaultCategoryId;

      if (categoryName !== 'כללי') {
        const { data: existingCategory, error: categoryCheckError } = await supabase
          .from('categories')
          .select('id')
          .eq('tenant_id', tenant.tenantId)
          .eq('is_active', true)
          .ilike('name', categoryName)
          .maybeSingle();

        if (existingCategory && !categoryCheckError) {
          categoryId = existingCategory.id;
        } else {
          const { data: newCategory, error: categoryInsertError } = await supabase
            .from('categories')
            .insert({
              tenant_id: tenant.tenantId,
              name: categoryName,
              default_margin_percent: 0,
              is_active: true,
              created_by: user.id,
            })
            .select('id')
            .single();

          if (!newCategory || categoryInsertError) {
            console.error('Failed to create category during import, falling back to default category:', {
              row,
              error: categoryInsertError,
            });
            categoryId = defaultCategoryId;
          } else {
            categoryId = newCategory.id;
            stats.categoriesCreated++;
          }
        }
      }

      // Upsert product
      const productNameNorm = normalizeName(row.product_name);
      let productId: string;

      const { data: existingProduct, error: productCheckError } = await supabase
        .from('products')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('is_active', true)
        .eq('name_norm', productNameNorm)
        .eq('category_id', categoryId)
        .maybeSingle();

      if (existingProduct && !productCheckError) {
        productId = existingProduct.id;
      } else {
        const { data: newProduct, error: productInsertError } = await supabase
          .from('products')
          .insert({
            tenant_id: tenant.tenantId,
            name: row.product_name,
            name_norm: productNameNorm,
            category_id: categoryId,
            unit: 'unit',
            is_active: true,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (!newProduct || productInsertError) {
          console.error('Failed to create product during import, skipping row:', {
            row,
            error: productInsertError,
          });
          stats.pricesSkipped++;
          continue;
        }

        productId = newProduct.id;
        stats.productsCreated++;
      }

      // Get category default margin
      const { data: category, error: categoryMarginError } = await supabase
        .from('categories')
        .select('default_margin_percent')
        .eq('id', categoryId)
        .maybeSingle();

      if (categoryMarginError) {
        console.error('Error fetching category margin:', categoryMarginError);
      }

      const marginPercent = category?.default_margin_percent ?? globalMarginPercent;
      const sellPrice = calcSellPrice({
        cost_price: row.price,
        margin_percent: marginPercent,
        vat_percent: vatPercent,
      });

      // Check current price
      const { data: currentPrice, error: priceCheckError } = await supabase
        .from('price_entries')
        .select('cost_price, sell_price')
        .eq('tenant_id', tenant.tenantId)
        .eq('product_id', productId)
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Skip if price is the same (only if we successfully fetched a price)
      if (!priceCheckError && currentPrice && 
          Number(currentPrice.cost_price) === row.price &&
          Number(currentPrice.sell_price) === sellPrice) {
        stats.pricesSkipped++;
        continue;
      }

      // Insert new price entry
      const { error: priceInsertError } = await supabase
        .from('price_entries')
        .insert({
          tenant_id: tenant.tenantId,
          product_id: productId,
          supplier_id: supplierId,
          cost_price: row.price,
          margin_percent: marginPercent,
          sell_price: sellPrice,
          created_by: user.id,
        });

      if (priceInsertError) {
        console.error('Failed to insert price entry during import, skipping row:', {
          row,
          error: priceInsertError,
        });
        stats.pricesSkipped++;
        continue;
      }

      stats.pricesInserted++;
    }

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return res.status(400).json({ error: firstIssue?.message || 'נתונים לא תקינים' });
    }
    console.error('Import apply error:', error);
    const errorMessage = error instanceof Error ? error.message : 'שגיאת שרת לא ידועה';
    console.error('Error details:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      tenantId: (req as any).tenant?.tenantId,
      userId: (req as any).user?.id,
    });
    res.status(500).json({ 
      error: 'שגיאת שרת',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
});

export default router;
