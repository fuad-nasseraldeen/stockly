import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant, ownerOnly } from '../middleware/auth.js';
import { normalizeName } from '../lib/normalize.js';
import { calcSellPrice, calcCostAfterDiscount } from '../lib/pricing.js';
import * as XLSX from 'xlsx';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const importModeSchema = z.enum(['merge', 'overwrite']);

interface ImportRow {
  product_name: string;
  supplier: string;
  price: number;
  category?: string;
  sku?: string;
  package_quantity?: number;
  discount_percent?: number;
}

// Helper functions for bulk operations
// For suppliers/categories: only trim + lowercase (preserve original characters)
// For products: use normalizeName (which does more aggressive normalization)
function normKey(name: string): string {
  return (name || '').trim().toLowerCase();
}

function productKey(nameNorm: string, categoryId: string): string {
  return `${nameNorm}||${categoryId}`;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Parse Excel/CSV file
function parseFile(buffer: Buffer, mimetype: string): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const allRows: ImportRow[] = [];

  // Process all sheets in the workbook
  for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[];

  if (rows.length < 2) {
      continue; // Skip empty sheets
  }

    // Use sheet name as category
    const categoryFromSheet = sheetName.trim();
    
    // Special handling for "רטבים ותבלינים" - product name in row 1, SKU in row 2
    // Check if sheet name contains either "רטבים" or "תבלינים" (case insensitive)
    const categoryLower = categoryFromSheet.toLowerCase();
    const isSpecialCategory = categoryLower.includes('רטבים') || categoryLower.includes('תבלינים');

    // Find header row and identify all supplier columns
  let headerRowIndex = -1;
  const headerMap: Record<string, number> = {};
    const supplierColumns: Array<{ supplierCol: number; priceCol: number; discountCol: number }> = [];
    let productIdx = -1; // Declare outside loop

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i] as any[];
    const lowerRow = row.map((cell: any) => String(cell || '').toLowerCase().trim());
    
      productIdx = lowerRow.findIndex(c => c.includes('product') || c.includes('מוצר') || c.includes('עמודה1'));
    const categoryIdx = lowerRow.findIndex(c => c.includes('category') || c.includes('קטגוריה'));
      const skuIdx = lowerRow.findIndex(c => c.includes('sku') || c.includes('מק"ט') || c.includes('barcode') || c.includes('ברקוד'));
      const packageQuantityIdx = lowerRow.findIndex(c => c.includes('package') || c.includes('quantity') || c.includes('כמות') || c.includes('אריזה'));

      // Find all supplier columns (look for "ספק" or "supplier")
      // Also check if there are multiple supplier patterns (ספק, ספק 2, ספק3, etc.)
      for (let col = 0; col < lowerRow.length; col++) {
        const cell = lowerRow[col];
        if (cell && (cell.includes('ספק') || cell.includes('supplier'))) {
          // Find corresponding price column (usually next column, or look for "מחיר" or "price")
          let priceCol = col + 1;
          // Look for price column in next few columns
          for (let checkCol = col + 1; checkCol < Math.min(col + 5, lowerRow.length); checkCol++) {
            const checkCell = lowerRow[checkCol];
            if (checkCell && ((checkCell.includes('מחיר') || checkCell.includes('price') || checkCell.includes('cost')) && !checkCell.includes('אחרי') && !checkCell.includes('after'))) {
              priceCol = checkCol;
              break;
            }
          }
          
          // Find discount column (usually 3-4 columns after supplier)
          let discountCol = col + 3;
          for (let checkCol = col + 2; checkCol < Math.min(col + 6, lowerRow.length); checkCol++) {
            const checkCell = lowerRow[checkCol];
            if (checkCell && ((checkCell.includes('הנחה') || checkCell.includes('discount')) && (checkCell.includes('אחוז') || checkCell.includes('percent')))) {
              discountCol = checkCol;
              break;
            }
          }

          supplierColumns.push({ supplierCol: col, priceCol, discountCol });
        }
      }

      // If no supplier columns found in header, try to infer from data structure
      // Pattern: A=product, B=supplier, C=price, D=price after, E=discount, F=supplier2, G=price2, etc.
      if (supplierColumns.length === 0 && productIdx >= 0) {
        // Try to find supplier columns by pattern: every 4-5 columns starting from productIdx+1
        // First supplier is usually right after product column
        let potentialSupplierCol = productIdx + 1;
        while (potentialSupplierCol < lowerRow.length) {
          // Check if this could be a supplier column (not empty, not a number header)
          const cell = lowerRow[potentialSupplierCol];
          if (cell && !cell.match(/^\d+$/)) {
            // Assume pattern: supplier, price, price_after, discount (4 columns)
            let priceCol = potentialSupplierCol + 1;
            let discountCol = potentialSupplierCol + 3;
            
            // Verify price column exists
            if (priceCol < lowerRow.length) {
              supplierColumns.push({ supplierCol: potentialSupplierCol, priceCol, discountCol });
            }
            
            // Move to next potential supplier (4 columns ahead)
            potentialSupplierCol += 4;
          } else {
            potentialSupplierCol++;
          }
          
          // Limit to reasonable number of suppliers (max 10)
          if (supplierColumns.length >= 10) break;
        }
      }

      if (productIdx >= 0 && supplierColumns.length > 0) {
      headerRowIndex = i;
      headerMap.product_name = productIdx;
      if (categoryIdx >= 0) headerMap.category = categoryIdx;
        if (skuIdx >= 0) headerMap.sku = skuIdx;
        if (packageQuantityIdx >= 0) headerMap.package_quantity = packageQuantityIdx;
      break;
    }
  }

    // If still no supplier columns found, try to infer from first data row
    if (productIdx >= 0 && supplierColumns.length === 0 && rows.length > headerRowIndex + 1) {
      // Look at first few data rows to find supplier pattern
      for (let dataRowIdx = headerRowIndex + 1; dataRowIdx < Math.min(headerRowIndex + 4, rows.length); dataRowIdx++) {
        const dataRow = rows[dataRowIdx] as any[];
        if (!dataRow || dataRow.length === 0) continue;
        
        // Pattern: A=product, B=supplier, C=price, D=price_after, E=discount, F=supplier2, G=price2, etc.
        let potentialSupplierCol = productIdx + 1;
        while (potentialSupplierCol < dataRow.length && supplierColumns.length < 10) {
          const supplierValue = String(dataRow[potentialSupplierCol] || '').trim();
          // If this looks like a supplier name (not empty, not a number)
          if (supplierValue && !/^\d+\.?\d*$/.test(supplierValue) && supplierValue !== '0' && supplierValue !== '-') {
            // Check if there's a price nearby
            for (let checkCol = potentialSupplierCol + 1; checkCol < Math.min(potentialSupplierCol + 4, dataRow.length); checkCol++) {
              const checkValue = String(dataRow[checkCol] || '').trim();
              const checkPrice = parseFloat(checkValue.replace(/[^\d.]/g, ''));
              if (!isNaN(checkPrice) && checkPrice > 0) {
                // Found a supplier with price - add it
                supplierColumns.push({ 
                  supplierCol: potentialSupplierCol, 
                  priceCol: checkCol, 
                  discountCol: potentialSupplierCol + 3 
                });
                break;
              }
            }
            // Move to next potential supplier (4 columns ahead)
            potentialSupplierCol += 4;
          } else {
            potentialSupplierCol++;
          }
        }
        
        if (supplierColumns.length > 0) break; // Found suppliers, stop looking
      }
    }

    if (headerRowIndex < 0 || supplierColumns.length === 0) {
      continue; // Skip this sheet if headers not found
    }

    // Parse data rows for this sheet
  const seen = new Map<string, ImportRow>(); // For deduplication: (product_name, supplier) -> last row

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || row.length === 0) continue;

      let productName = String(row[headerMap.product_name] || '').trim();
      let sku: string | undefined = undefined;
      
      // Special handling for "רטבים ותבלינים": row 1 = product name, row 2 = SKU
      // In this category, the SKU row has:
      // - Only numbers in product column (the SKU itself)
      // - May have supplier names (copied from previous row)
      // - NO prices (all price columns are empty)
      if (isSpecialCategory && i + 1 < rows.length) {
        const nextRow = rows[i + 1] as any[];
        if (nextRow && nextRow.length > 0) {
          const nextRowProductCol = String(nextRow[headerMap.product_name] || '').trim();
          // Check if next row looks like SKU (only numbers in product column)
          if (nextRowProductCol && /^\d+$/.test(nextRowProductCol)) {
            // For special category, check if next row is a SKU row
            // A SKU row has numbers in product column and NO valid prices in any price column
            // (suppliers may exist, but prices should be empty)
            
            let hasValidPrice = false;
            
            // Check all price columns - if ANY has a valid price > 0, it's NOT a SKU row
            for (const { priceCol } of supplierColumns) {
              if (priceCol < nextRow.length) {
                const priceValue = String(nextRow[priceCol] || '').trim();
                if (priceValue && priceValue !== '0' && priceValue !== '-' && priceValue !== '') {
                  const priceNum = parseFloat(priceValue.replace(/[^\d.]/g, ''));
                  if (!isNaN(priceNum) && priceNum > 0) {
                    hasValidPrice = true;
                    break;
                  }
                }
              }
            }
            
            // If no valid prices found, this is a SKU row (even if suppliers exist)
            if (!hasValidPrice) {
              sku = nextRowProductCol;
              i++; // Skip the SKU row in main loop
            }
          }
        }
      }
      
      // Skip if product name is empty
      if (!productName) continue;
      
      // Skip if product name is only numbers (might be SKU row, but we already handled it above for special category)
      if (!isSpecialCategory && /^\d+$/.test(productName)) continue;

      // Use category from column if exists, otherwise use sheet name
      const categoryFromColumn = headerMap.category !== undefined ? String(row[headerMap.category] || '').trim() : undefined;
      const category = categoryFromColumn && categoryFromColumn.length > 0 ? categoryFromColumn : categoryFromSheet;
      
      // If SKU not found from special handling, try to get from column
      if (!sku) {
        sku = headerMap.sku !== undefined ? String(row[headerMap.sku] || '').trim() : undefined;
      }
      
      const packageQuantityStr = headerMap.package_quantity !== undefined ? String(row[headerMap.package_quantity] || '').trim() : undefined;

      // Process all suppliers found in header
      for (const { supplierCol, priceCol, discountCol } of supplierColumns) {
        const supplier = String(row[supplierCol] || '').trim();
        // Skip if supplier is empty, 0, or dash
        if (!supplier || supplier === '0' || supplier === '-') continue;

        // Skip if product name is empty (should not happen, but double check)
        if (!productName || productName.trim() === '') continue;

        const priceStr = priceCol < row.length ? String(row[priceCol] || '').trim() : '';
        // Skip if price is empty, 0, or dash
        if (!priceStr || priceStr === '0' || priceStr === '-') continue;

    const price = parseFloat(priceStr.replace(/[^\d.]/g, ''));
        // Skip if price is invalid, negative, or zero (price must be > 0)
        if (isNaN(price) || price <= 0) continue;

        const discountStr = discountCol < row.length ? String(row[discountCol] || '').trim() : '';
        const discountPercent = discountStr ? parseFloat(discountStr.replace(/[^\d.]/g, '')) : undefined;

        const packageQuantity = packageQuantityStr ? parseFloat(packageQuantityStr.replace(/[^\d.]/g, '')) : undefined;

        const key = `${productName.toLowerCase()}|${supplier.toLowerCase()}|${categoryFromSheet}`;
    const importRow: ImportRow = {
      product_name: productName,
      supplier,
      price,
          // Use category from column if exists, otherwise use sheet name
          category: category,
          // Include SKU if found (from special handling or column)
          sku: sku && sku.length > 0 ? sku : undefined,
          package_quantity: packageQuantity && !isNaN(packageQuantity) && packageQuantity > 0 ? packageQuantity : undefined,
          discount_percent: discountPercent && !isNaN(discountPercent) && discountPercent >= 0 && discountPercent <= 100 ? discountPercent : undefined,
    };

    seen.set(key, importRow); // Keep last occurrence
  }
    }

    // Add rows from this sheet to the overall collection
    allRows.push(...Array.from(seen.values()));
  }

  if (allRows.length === 0) {
    throw new Error('לא נמצאו שורות נתונים תקינות באף גיליון');
  }

  return allRows;
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
    const productsByCategory = new Map<string, Set<string>>(); // category -> Set of product names

    for (const row of rows) {
      // Validate required fields - skip rows with missing data
      if (!row.product_name || row.product_name.trim() === '') {
        errors.push(`שורה עם ספק "${row.supplier || 'לא ידוע'}" ללא שם מוצר - דילוג`);
        continue;
      }
      if (!row.supplier || row.supplier.trim() === '' || row.supplier === '0' || row.supplier === '-') {
        errors.push(`מוצר "${row.product_name}" ללא ספק - דילוג`);
        continue;
      }
      if (!row.price || row.price <= 0) {
        errors.push(`מוצר "${row.product_name}" ספק "${row.supplier}" ללא מחיר תקין - דילוג`);
        continue;
      }

      suppliers.add(row.supplier.toLowerCase());
      const category = row.category || 'כללי';
      categories.add(category.toLowerCase());
      const normalizedProductName = normalizeName(row.product_name);
      products.add(normalizedProductName);

      // Count products by category
      if (!productsByCategory.has(category)) {
        productsByCategory.set(category, new Set());
      }
      productsByCategory.get(category)!.add(normalizedProductName);

      preview.push({
        product_name: row.product_name,
        supplier: row.supplier,
        price: row.price,
        category: category,
        sku: row.sku || undefined,
        package_quantity: row.package_quantity || undefined,
        discount_percent: row.discount_percent || undefined,
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

    // Get settings for VAT, margin, use_margin, and use_vat
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('vat_percent,global_margin_percent,use_margin,use_vat')
      .eq('tenant_id', tenant.tenantId)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
    }

    const vatPercent = settings?.vat_percent || 18;
    const globalMarginPercent = settings?.global_margin_percent ?? 30;
    const useMargin = settings?.use_margin === true; // Default to false if not set
    const useVat = settings?.use_vat === true; // Default to false if not set

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

    // Process import - FAST VERSION with bulk operations
    const stats = {
      suppliersCreated: 0,
      categoriesCreated: 0,
      productsCreated: 0,
      pricesInserted: 0,
      pricesSkipped: 0,
    };
    const productsByCategory = new Map<string, Set<string>>();

    // 1) Get or create default category (handle duplicates safely)
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

    // 2) Filter + validate rows once (same rules as inside loop)
    const validRows = rows.filter(r =>
      r.product_name && r.product_name.trim() !== '' &&
      r.supplier && r.supplier.trim() !== '' && r.supplier !== '0' && r.supplier !== '-' &&
      r.price && r.price > 0
    );

    // 3) Collect unique suppliers/categories/products we might touch
    const suppliersNeeded = new Set<string>();
    const categoriesNeeded = new Set<string>(); // includes 'כללי' maybe, that's ok
    const productsNeeded: Array<{ name: string; nameNorm: string; categoryName: string; sku?: string | null; packageQty?: number | null }> = [];

    for (const r of validRows) {
      suppliersNeeded.add(normKey(r.supplier));
      const categoryName = (r.category && r.category.trim()) ? r.category.trim() : 'כללי';
      categoriesNeeded.add(normKey(categoryName));

      const nameNorm = normalizeName(r.product_name);
      productsNeeded.push({
        name: r.product_name,
        nameNorm,
        categoryName,
        sku: r.sku?.trim() ? r.sku.trim() : null,
        packageQty: (r.package_quantity && r.package_quantity > 0) ? r.package_quantity : null,
      });
    }

    // 4) Preload existing suppliers/categories/products ONCE
    const [
      { data: existingSuppliers, error: supErr },
      { data: existingCategories, error: catErr },
      { data: existingProducts, error: prodErr },
    ] = await Promise.all([
      supabase.from('suppliers').select('id,name').eq('tenant_id', tenant.tenantId).eq('is_active', true),
      supabase.from('categories').select('id,name').eq('tenant_id', tenant.tenantId).eq('is_active', true),
      supabase.from('products').select('id,name_norm,category_id,name').eq('tenant_id', tenant.tenantId).eq('is_active', true),
    ]);

    if (supErr) console.error('Error preloading suppliers:', supErr);
    if (catErr) console.error('Error preloading categories:', catErr);
    if (prodErr) console.error('Error preloading products:', prodErr);

    // Build caches
    const supplierIdByName = new Map<string, string>();
    for (const s of (existingSuppliers || [])) supplierIdByName.set(normKey(s.name), s.id);

    const categoryIdByName = new Map<string, string>();
    const categoryNameById = new Map<string, string>(); // For fast O(1) lookup later
    for (const c of (existingCategories || [])) {
      categoryIdByName.set(normKey(c.name), c.id);
      categoryNameById.set(c.id, c.name);
    }

    // Ensure we know defaultCategoryId in cache too
    categoryIdByName.set(normKey('כללי'), defaultCategoryId);
    categoryNameById.set(defaultCategoryId, 'כללי');

    const productIdByKey = new Map<string, string>();
    for (const p of (existingProducts || [])) {
      const key = productKey(p.name_norm, p.category_id);
      productIdByKey.set(key, p.id);
    }

    // 5) Create missing suppliers in bulk
    const missingSuppliers = Array.from(suppliersNeeded).filter(n => !supplierIdByName.has(n));
    if (missingSuppliers.length) {
      // We need to preserve original supplier names, not normalized ones
      // So we need to map back from normalized to original
      const supplierNameMap = new Map<string, string>();
      for (const r of validRows) {
        const norm = normKey(r.supplier);
        if (!supplierNameMap.has(norm)) {
          supplierNameMap.set(norm, r.supplier);
        }
      }

      const supplierRows = missingSuppliers.map(n => ({
        tenant_id: tenant.tenantId,
        name: supplierNameMap.get(n) || n, // Use original name if available
        is_active: true,
        created_by: user.id,
      }));

      // Use insert with error handling for unique index on tenant_id + LOWER(name)
      // Since we have unique INDEX (not constraint), upsert won't work directly
      for (const part of chunk(supplierRows, 500)) {
        // Try insert first, if fails due to unique constraint, fetch existing
        const { data: inserted, error } = await supabase
          .from('suppliers')
          .insert(part)
          .select('id,name');
        
        if (error) {
          // If unique constraint violation, fetch existing suppliers by name
          // Use ilike because unique index is on LOWER(name), not exact name
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
            const namesToFetch = part.map(r => r.name);
            // Build OR query with ilike for each name (handles case-insensitive matching)
            // Chunk to avoid too long OR queries (Supabase has limits)
            for (const nameChunk of chunk(namesToFetch, 20)) {
              const orConditions = nameChunk
                .map(n => `name.ilike.${n.replaceAll(',', '\\,').replaceAll('.', '\\.')}`)
                .join(',');
              
              const { data: existing } = await supabase
        .from('suppliers')
                .select('id,name')
        .eq('tenant_id', tenant.tenantId)
        .eq('is_active', true)
                .or(orConditions);

              if (existing) {
                for (const s of existing) {
                  const key = normKey(s.name);
                  // Only add to map if not already there (might be from preload)
                  if (!supplierIdByName.has(key)) {
                    supplierIdByName.set(key, s.id);
                  }
                }
              }
            }
      } else {
            console.error('Bulk supplier insert failed:', error);
          continue;
        }
        } else {
          // Successfully inserted new suppliers
          for (const s of (inserted || [])) {
            supplierIdByName.set(normKey(s.name), s.id);
        stats.suppliersCreated++;
      }
        }
      }
    }

    // 6) Create missing categories in bulk (except 'כללי')
    const missingCategories = Array.from(categoriesNeeded)
      .filter(n => n !== normKey('כללי'))
      .filter(n => !categoryIdByName.has(n));

    if (missingCategories.length) {
      // Map back to original category names
      const categoryNameMap = new Map<string, string>();
      for (const r of validRows) {
        const categoryName = (r.category && r.category.trim()) ? r.category.trim() : 'כללי';
        const norm = normKey(categoryName);
        if (norm !== normKey('כללי') && !categoryNameMap.has(norm)) {
          categoryNameMap.set(norm, categoryName);
        }
      }

      const categoryRows = missingCategories.map(n => ({
              tenant_id: tenant.tenantId,
        name: categoryNameMap.get(n) || n, // Use original name if available
              default_margin_percent: 0,
              is_active: true,
              created_by: user.id,
      }));

      for (const part of chunk(categoryRows, 500)) {
        const { data: inserted, error } = await supabase
          .from('categories')
          .insert(part)
          .select('id,name');

        if (error) {
          // If unique constraint violation, fetch existing categories by name
          // Use ilike because unique index is on LOWER(name), not exact name
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
            const namesToFetch = part.map(r => r.name);
            // Build OR query with ilike for each name (handles case-insensitive matching)
            // Chunk to avoid too long OR queries (Supabase has limits)
            for (const nameChunk of chunk(namesToFetch, 20)) {
              const orConditions = nameChunk
                .map(n => `name.ilike.${n.replaceAll(',', '\\,').replaceAll('.', '\\.')}`)
                .join(',');
              
              const { data: existing } = await supabase
                .from('categories')
                .select('id,name')
                .eq('tenant_id', tenant.tenantId)
                .eq('is_active', true)
                .or(orConditions);
              
              if (existing) {
                for (const c of existing) {
                  categoryIdByName.set(normKey(c.name), c.id);
                  categoryNameById.set(c.id, c.name);
                }
              }
            }
          } else {
            console.error('Bulk category insert failed:', error);
            continue;
          }
          } else {
          // Successfully inserted new categories
          for (const c of (inserted || [])) {
            categoryIdByName.set(normKey(c.name), c.id);
            categoryNameById.set(c.id, c.name);
            stats.categoriesCreated++;
          }
        }
        }
      }

    // 7) Create missing products in bulk
    // Build unique product keys desired
    const desiredProducts = new Map<string, { name: string; nameNorm: string; categoryId: string; sku?: string | null; packageQty?: number | null; categoryName: string }>();

    for (const p of productsNeeded) {
      const catId = categoryIdByName.get(normKey(p.categoryName)) || defaultCategoryId;
      const key = productKey(p.nameNorm, catId);
      if (!desiredProducts.has(key)) {
        desiredProducts.set(key, { ...p, categoryId: catId, categoryName: p.categoryName });
      } else {
        // Keep first occurrence's SKU/package_quantity if current has them and first doesn't
        const existing = desiredProducts.get(key)!;
        if (!existing.sku && p.sku) existing.sku = p.sku;
        if (!existing.packageQty && p.packageQty) existing.packageQty = p.packageQty;
      }
    }

    const missingProductRows = Array.from(desiredProducts.entries())
      .filter(([key]) => !productIdByKey.has(key))
      .map(([, v]) => ({
            tenant_id: tenant.tenantId,
        name: v.name,
        name_norm: v.nameNorm,
        category_id: v.categoryId,
            unit: 'unit',
        sku: v.sku ?? null,
        package_quantity: v.packageQty ?? 1,
            is_active: true,
            created_by: user.id,
      }));

    if (missingProductRows.length) {
      for (const part of chunk(missingProductRows, 500)) {
        const { data: inserted, error } = await supabase
          .from('products')
          .insert(part)
          .select('id,name_norm,category_id');

        if (error) {
          // If unique constraint violation, fetch existing products
          // Unique index is on (tenant_id, category_id, name_norm) - so we need exact match
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
            // Build OR query for exact (name_norm, category_id) pairs
            // Since Supabase OR doesn't support AND within OR easily, we'll query by category_id first
            // and filter in memory (more efficient than fetching entire categories)
            const categoryIds = Array.from(new Set(part.map(p => p.category_id)));
            const nameNorms = Array.from(new Set(part.map(p => p.name_norm)));
            
            // Fetch products for these categories and name_norms
            const { data: existing } = await supabase
              .from('products')
              .select('id,name_norm,category_id')
              .eq('tenant_id', tenant.tenantId)
              .eq('is_active', true)
              .in('category_id', categoryIds)
              .in('name_norm', nameNorms);
            
            // Filter in memory to match exact (name_norm, category_id) pairs
            const partKeys = new Set(part.map(p => `${p.name_norm}||${p.category_id}`));
              
            if (existing) {
              for (const p of existing) {
                const key = `${p.name_norm}||${p.category_id}`;
                if (partKeys.has(key)) {
                  productIdByKey.set(productKey(p.name_norm, p.category_id), p.id);
                }
              }
            }
          } else {
            console.error('Bulk product insert failed:', error);
          continue;
        }
        } else {
          // Successfully inserted new products
          for (const p of (inserted || [])) {
            productIdByKey.set(productKey(p.name_norm, p.category_id), p.id);
        stats.productsCreated++;
      }
        }
      }
    }

    // 8) Build all price intents (resolved IDs) and preload latest prices in bulk
    type PriceIntent = {
      row: ImportRow;
      supplierId: string;
      productId: string;
      categoryName: string;
      productNameNorm: string;
      discountPercent: number;
      costAfterDiscount: number;
      sellPrice: number;
    };

    const intents: PriceIntent[] = [];
    for (const r of validRows) {
      const supplierId = supplierIdByName.get(normKey(r.supplier));
      if (!supplierId) { stats.pricesSkipped++; continue; }

      const categoryName = (r.category && r.category.trim()) ? r.category.trim() : 'כללי';
      const categoryId = categoryIdByName.get(normKey(categoryName)) || defaultCategoryId;

      const nameNorm = normalizeName(r.product_name);
      const pId = productIdByKey.get(productKey(nameNorm, categoryId));
      if (!pId) { stats.pricesSkipped++; continue; }

      const discountPercent = r.discount_percent ?? 0;
      const costAfterDiscount = calcCostAfterDiscount(r.price, discountPercent);
      const sellPrice = calcSellPrice({
        cost_price: r.price,
        margin_percent: globalMarginPercent,
        vat_percent: vatPercent,
        cost_price_after_discount: costAfterDiscount,
        use_margin: useMargin,
        use_vat: useVat,
      });

      intents.push({
        row: r,
        supplierId,
        productId: pId,
        categoryName,
        productNameNorm: nameNorm,
        discountPercent,
        costAfterDiscount,
        sellPrice,
      });
    }

    // Track products by category (after intents are built)
    for (const v of desiredProducts.values()) {
      const category = (v.categoryName && v.categoryName.trim()) ? v.categoryName : 'כללי';
      if (!productsByCategory.has(category)) productsByCategory.set(category, new Set());
      productsByCategory.get(category)!.add(v.nameNorm);
    }
    // Also track existing products that are being used in this import
    const usedProductIds = new Set(intents.map(i => i.productId));
    for (const p of (existingProducts || [])) {
      if (usedProductIds.has(p.id)) {
        // Use Map for O(1) lookup instead of O(N) find
        const categoryName = categoryNameById.get(p.category_id) || 'כללי';
        if (!productsByCategory.has(categoryName)) productsByCategory.set(categoryName, new Set());
        productsByCategory.get(categoryName)!.add(p.name_norm);
      }
    }

    // Preload latest prices for relevant pairs in one query
    const productIds = Array.from(new Set(intents.map(i => i.productId)));
    const supplierIds = Array.from(new Set(intents.map(i => i.supplierId)));

    // Fetch recent prices for these pairs; we'll compute latest in memory.
    const latestPriceByPair = new Map<string, { cost_price: number; discount_percent: number | null; sell_price: number }>();

    if (productIds.length && supplierIds.length) {
      // Pull all price_entries for these products+suppliers, then pick latest per pair.
      // No time limit - we need the absolute latest price ever (same logic as original)
      const { data: prices, error: pricesErr } = await supabase
        .from('price_entries')
        .select('product_id,supplier_id,cost_price,discount_percent,sell_price,created_at')
        .eq('tenant_id', tenant.tenantId)
        .in('product_id', productIds)
        .in('supplier_id', supplierIds)
        .order('created_at', { ascending: false });

      if (pricesErr) {
        console.error('Error preloading prices:', pricesErr);
      } else {
        for (const p of (prices || [])) {
          const key = `${p.product_id}||${p.supplier_id}`;
          if (!latestPriceByPair.has(key)) {
            latestPriceByPair.set(key, {
              cost_price: Number(p.cost_price),
              discount_percent: p.discount_percent === null ? null : Number(p.discount_percent),
              sell_price: Number(p.sell_price),
            });
          }
        }
      }
    }

    // 10) Insert new price entries in bulk, skipping equals (same logic as before)
    const priceRowsToInsert = [];

    for (const i of intents) {
      const key = `${i.productId}||${i.supplierId}`;
      const current = latestPriceByPair.get(key);

      const same =
        current &&
        Number(current.cost_price) === i.row.price &&
        Number(current.discount_percent ?? 0) === i.discountPercent &&
        Number(current.sell_price) === i.sellPrice;

      if (same) {
        stats.pricesSkipped++;
        continue;
      }

      priceRowsToInsert.push({
          tenant_id: tenant.tenantId,
        product_id: i.productId,
        supplier_id: i.supplierId,
        cost_price: i.row.price,
        discount_percent: i.discountPercent,
        cost_price_after_discount: i.costAfterDiscount,
        margin_percent: globalMarginPercent,
        sell_price: i.sellPrice,
          created_by: user.id,
        });
    }

    for (const part of chunk(priceRowsToInsert, 500)) {
      const { error } = await supabase
        .from('price_entries')
        .insert(part); // bulk insert
      if (error) {
        console.error('Bulk price insert failed:', error);
        // Preserve old behavior: failed inserts are skipped
        stats.pricesSkipped += part.length;
        continue;
      }
      stats.pricesInserted += part.length;
    }

    // Build category statistics
    const categoryStats: Record<string, { total: number }> = {};
    for (const [category, productSet] of productsByCategory.entries()) {
      categoryStats[category] = {
        total: productSet.size,
      };
    }

    res.json({
      success: true,
      stats: {
        ...stats,
        byCategory: categoryStats,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return res.status(400).json({ error: firstIssue?.message || 'נתונים לא תקינים' });
    }

    const errorMessage = error instanceof Error ? error.message : 'שגיאת שרת לא ידועה';
    console.error('Import apply error:', errorMessage, {
      stack: error instanceof Error ? error.stack : undefined,
      tenantId: (req as any).tenant?.tenantId,
      userId: (req as any).user?.id,
    });

    // מחזירים הודעה מפורטת ל-frontend כדי שנוכל לראות מה נשבר
    res.status(500).json({ 
      error: errorMessage,
    });
  }
});

export default router;
