import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts, useDeleteProduct, useProductPriceHistory } from '../hooks/useProducts';
import { useSuppliers } from '../hooks/useSuppliers';
import { useCategories } from '../hooks/useCategories';
import { useSettings } from '../hooks/useSettings';
import { useDebounce } from '../hooks/useDebounce';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Search, Edit, Trash2, DollarSign, Calendar, Download, FileText, ChevronDown } from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { productsApi, type Product } from '../lib/api';
import { getDefaultLayout, type Settings as SettingsType } from '../lib/column-resolver';
import { mergeWithDefaults } from '../lib/column-layout-storage';
import { useTableLayout } from '../hooks/useTableLayout';
import { downloadTablePdf } from '../lib/pdf-service';
import { getPriceTableExportLayout, priceRowToExportValues } from '../lib/pdf-price-table';
import { useTenant } from '../hooks/useTenant';
import { ProductsSkeleton } from '../components/ProductsSkeleton';
import { grossToNet } from '../lib/pricing-rules';

type SortOption = 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc';

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename: string, csvUtf8: string): void {
  const blob = new Blob([csvUtf8], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// Derive per-product summary (min current cost + last update) from prices array
function getProductDerivedSummary(product: Product) {
  const prices = product.prices ?? [];
  if (!prices.length) return null;

  let minCost: number | null = null;
  let lastUpdated: string | null = null;

  for (const price of prices) {
    const baseCost = (price.cost_price_after_discount ?? price.cost_price) as number | null;
    if (typeof baseCost === 'number' && !Number.isNaN(baseCost)) {
      if (minCost === null || baseCost < minCost) {
        minCost = baseCost;
      }
    }

    if (price.created_at) {
      if (!lastUpdated || price.created_at > lastUpdated) {
        lastUpdated = price.created_at;
      }
    }
  }

  if (minCost === null && !lastUpdated) return null;
  return { minCost, lastUpdated };
}

export default function Products() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350); // Debounce search input by 350ms
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [sort, setSort] = useState<SortOption>('updated_desc');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [historySupplierId, setHistorySupplierId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedPriceId, setExpandedPriceId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStage, setPdfStage] = useState<'idle' | 'fetching' | 'generating' | 'downloading'>('idle');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [excelProgress, setExcelProgress] = useState(0);
  const [excelStage, setExcelStage] = useState<'idle' | 'fetching' | 'generating' | 'downloading'>('idle');

  const { data: productsData, isLoading } = useProducts({
    search: debouncedSearch || undefined,
    supplier_id: supplierFilter || undefined,
    category_id: categoryFilter || undefined,
    sort,
    page,
    pageSize,
  });

  const products = productsData?.products || [];
  const totalProducts = productsData?.total || 0;
  const totalPages = productsData?.totalPages || 0;
  const currentPage = productsData?.page || 1;

  const { data: suppliers = [] } = useSuppliers();
  const { data: categories = [] } = useCategories();
  const { data: settings } = useSettings();
  const { data: priceHistory = [], isLoading: historyLoading } = useProductPriceHistory(
    historyProductId || '',
    historySupplierId || undefined
  );
  const deleteProduct = useDeleteProduct();


  const handleDelete = async () => {
    if (!productToDelete) return;
    try {
      await deleteProduct.mutateAsync(productToDelete.id);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  // Format cost price (including VAT) - 2 decimal places
  const formatCostPrice = (num: number): string => {
    if (isNaN(num) || num === null || num === undefined) return '0';
    return parseFloat(num.toFixed(2)).toString();
  };

  // Format unit price - 4 decimal places, removing trailing zeros
  const formatUnitPrice = (num: number): string => {
    if (isNaN(num) || num === null || num === undefined) return '0';
    // Use toFixed(4) to get up to 4 decimal places, then remove trailing zeros
    return parseFloat(num.toFixed(4)).toString();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(price);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('he-IL');
  };

  const useVat = settings?.use_vat === true; // Default to false if not set
  const useMargin = settings?.use_margin === true; // Default to false if not set
  
  const vatPercent = settings?.vat_percent ?? 18;
  const appSettings: SettingsType = useMemo(() => ({
    use_vat: useVat,
    use_margin: useMargin,
    vat_percent: vatPercent,
    global_margin_percent: settings?.global_margin_percent ?? undefined,
  }), [useVat, useMargin, vatPercent, settings?.global_margin_percent]);
  
  // Load layout from React Query cache (seeded by bootstrap) - no separate API call during boot
  const { data: savedLayout } = useTableLayout('productsTable');
  
  // Listen for layout changes (when user saves layout in Settings page)
  useEffect(() => {
    const handleLayoutChange = () => {
      // Layout will be updated via useTableLayout hook when cache is invalidated
      // This event is just a signal to re-render
    };
    
    window.addEventListener('priceTableLayoutChanged', handleLayoutChange);
    return () => {
      window.removeEventListener('priceTableLayoutChanged', handleLayoutChange);
    };
  }, []);
  

  const closeHistory = () => {
    setHistoryOpen(false);
    setHistoryProductId(null);
    setHistorySupplierId(null);
  };

  // Reset to page 1 when search/filters change
  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handleSupplierFilterChange = (newSupplier: string) => {
    setSupplierFilter(newSupplier);
    setPage(1);
  };

  const handleCategoryFilterChange = (newCategory: string) => {
    setCategoryFilter(newCategory);
    setPage(1);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
    setPage(1);
  };

  const handleExport = async () => {
    if (isExportingExcel) return;
    let generatingIntervalId: number | undefined;
    try {
      setIsExportingExcel(true);
      setExcelStage('fetching');
      setExcelProgress(0);

      const filterParams = {
        search: debouncedSearch || undefined,
        supplier_id: supplierFilter || undefined,
        category_id: categoryFilter || undefined,
        sort,
      };

      // Reuse same cache key as PDF ("all products" for these filters)
      const allProductsCacheKey = ['products', { ...filterParams, all: true }] as const;
      const cachedAllProducts = queryClient.getQueryData<{ products: Product[]; total: number }>(allProductsCacheKey);

      let allProducts: Product[] = [];

      if (cachedAllProducts?.products) {
        allProducts = cachedAllProducts.products;
        setExcelProgress(75);
      } else if (productsData && productsData.total === products.length) {
        // If first page contains all filtered results, use it (e.g., total=10, pageSize=12)
        allProducts = products;
        setExcelProgress(75);
      } else {
        setExcelProgress(10);
        const response = await productsApi.list({ ...filterParams, all: true });
        allProducts = response.products || [];
        queryClient.setQueryData(allProductsCacheKey, { products: allProducts, total: response.total });
        setExcelProgress(75);
      }

      if (!allProducts || allProducts.length === 0) {
        alert('אין מוצרים לייצוא');
        return;
      }

      // Generating stage (75–95)
      setExcelStage('generating');
      generatingIntervalId = window.setInterval(() => {
        const startBase = 75;
        const maxTarget = 95;
        setExcelProgress((prev) => Math.min(Math.max(prev, startBase) + 1, maxTarget));
      }, 250);

      // Build CSV (match backend /api/export/filtered.csv headers)
      const BOM = '\uFEFF';
      let csv =
        BOM +
        'product_name,sku,supplier,cost_price,discount_percent,cost_price_after_discount,margin_percent,sell_price,package_quantity,category,last_updated\n';

      for (const p of allProducts) {
        const productName = p?.name ?? '';
        const sku = p?.sku ?? '';
        const categoryName = p?.category?.name ?? 'כללי';
        const prices = Array.isArray(p?.prices) ? p.prices : [];

        // Keep same semantics as backend: one row per supplier price
        for (const price of prices) {
          const supplierName = price?.supplier_name ?? '';
          const costPrice = price?.cost_price ?? '';
          const discountPercent = price?.discount_percent ?? 0;
          const costPriceAfterDiscount = price?.cost_price_after_discount ?? '';
          const marginPercent = price?.margin_percent ?? '';
          const sellPrice = price?.sell_price ?? '';
          const lastUpdated = price?.created_at ? new Date(price.created_at).toLocaleDateString('he-IL') : '';
          const packageQty = price?.package_quantity ?? '';

          csv +=
            `${csvEscape(productName)},` +
            `${csvEscape(sku)},` +
            `${csvEscape(supplierName)},` +
            `${costPrice},` +
            `${discountPercent},` +
            `${costPriceAfterDiscount},` +
            `${marginPercent},` +
            `${sellPrice},` +
            `${packageQty},` +
            `${csvEscape(categoryName)},` +
            `${csvEscape(lastUpdated)}\n`;
        }
      }

      // Download started
      if (generatingIntervalId !== undefined) {
        window.clearInterval(generatingIntervalId);
      }
      setExcelStage('downloading');
      setExcelProgress(100);

      downloadCsvFile('products_export.csv', csv);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('שגיאה בייצוא הקובץ');
    } finally {
      window.setTimeout(() => {
        if (generatingIntervalId !== undefined) {
          window.clearInterval(generatingIntervalId);
        }
        setIsExportingExcel(false);
        setExcelProgress(0);
        setExcelStage('idle');
      }, 400);
    }
  };

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;

    let generatingIntervalId: number | undefined;

    try {
      setIsExportingPdf(true);
      setPdfStage('fetching');
      setPdfProgress(0);

      // Build filter params for cache lookup
      const filterParams = {
        search: debouncedSearch || undefined,
        supplier_id: supplierFilter || undefined,
        category_id: categoryFilter || undefined,
        sort,
      };

      // Check cache first: Look for "all products" query
      const allProductsCacheKey = ['products', { ...filterParams, all: true }] as const;
      const cachedAllProducts = queryClient.getQueryData<{ products: Product[]; total: number }>(allProductsCacheKey);

      let allProducts: Product[] = [];

      if (cachedAllProducts && cachedAllProducts.products) {
        // Found cache of all products - use it!
        console.log('[PDF] Using cached all products:', cachedAllProducts.products.length);
        allProducts = cachedAllProducts.products;
        setPdfProgress(75); // Skip to 75% since we have data
      } else {
        // No cache of all products - check if first page contains all products
        // If total === products.length in first page, we have all products already!
        if (productsData && productsData.total === products.length) {
          // First page contains all products - use it!
          console.log('[PDF] First page contains all products, using it:', products.length);
          allProducts = products;
          setPdfProgress(75); // Skip to 75% since we have data
        } else {
          // Need to fetch all products - single API call with all=true
          console.log('[PDF] Fetching all products from API...');
          setPdfProgress(10);
          
          const response = await productsApi.list({
            ...filterParams,
            all: true, // Fetch all products in one request
          });

          allProducts = response.products || [];
          
          // Cache the result for future use
          queryClient.setQueryData(allProductsCacheKey, {
            products: allProducts,
            total: response.total,
          });
          
          setPdfProgress(75);
        }
      }

      if (!allProducts || allProducts.length === 0) {
        alert('אין מוצרים לייצוא');
        return;
      }

      // Switch to "generating PDF" stage with smooth simulated progress (75–95%)
      setPdfStage('generating');
      generatingIntervalId = window.setInterval(() => {
        const startBase = 75;
        const maxTarget = 95;

        setPdfProgress((prev) => {
          // התחלה לפחות מ-75
          const current = Math.max(prev, startBase);
          // צעד קדימה - מספר שלם בלבד
          const next = current + 1;
          return Math.min(next, maxTarget);
        });
      }, 250);

      const { columns } = await getPriceTableExportLayout(appSettings, 'productsTable');

      // Always include product name column in export
      const baseColumns = [
        ...columns,
        { key: 'product_name', label: 'שם מוצר' },
      ];

      // Add SKU column if any product has SKU
      const hasSku = allProducts.some((p) => p.sku);
      const exportColumns = hasSku
        ? [
            ...baseColumns,
            { key: 'sku', label: 'מק״ט' },
          ]
        : baseColumns;

      const columnKeys = exportColumns.map((c) => c.key);

      // Build row arrays in the same order as columnKeys.
      // Each supplier price becomes its own row.
      const rowObjects = allProducts.flatMap((p) => {
        const prices = p?.prices || [];

        if (!prices.length) {
          // Product with no prices – single empty row with product context only
          return [
            columnKeys.map(() => '-' as string | number | null),
          ];
        }

        // One row per supplier price
        return prices.map((price) =>
          priceRowToExportValues({
            price,
            product: p,
            settings: appSettings,
            columnKeys,
          }),
        );
      });

      // Format date for subtitle
      const currentDate = new Date().toLocaleDateString('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      // Adapt columns & rows to the flat table format expected by the PDF service
      await downloadTablePdf({
        storeName: currentTenant?.name || 'Stockly',
        title: `מוצרים | ${currentDate}`, // Title with date on the right (RTL)
        subtitle: `סך הכל: ${allProducts.length} מוצרים`, // Total count of products
        columns: exportColumns.map((c) => ({
          key: c.key,
          label: c.label,
        })),
        rows: rowObjects,
        filename: 'products.pdf',
      });

      // Download started
      if (generatingIntervalId !== undefined) {
        window.clearInterval(generatingIntervalId);
      }
      setPdfStage('downloading');
      setPdfProgress(100);
    } catch (error) {
      console.error('Error printing:', error);
      alert('שגיאה בייצוא PDF');
    } finally {
      window.setTimeout(() => {
        if (generatingIntervalId !== undefined) {
          window.clearInterval(generatingIntervalId);
        }
        setIsExportingPdf(false);
        setPdfProgress(0);
        setPdfStage('idle');
      }, 400);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">מוצרים</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            נהל את כל המוצרים והמחירים שלך • סה״כ {totalProducts} מוצרים
          </p>
        </div>
        <div className="flex flex-col gap-2 items-stretch sm:items-center">
          {/* Desktop actions */}
          <div className="hidden sm:flex gap-2 flex-wrap">
            {/* Add product */}
            <Button
              onClick={() => navigate('/products/new')}
              size="lg"
              className="shadow-md hover:shadow-lg"
            >
              <Plus className="w-4 h-4 ml-2" />
              הוסף מוצר
            </Button>

            {/* Export (Excel/CSV) */}
            <Button
              onClick={handleExport}
              variant="outline"
              size="lg"
              className="shadow-md hover:shadow-lg min-w-[160px]"
              disabled={isExportingExcel}
            >
              <Download className="w-4 h-4 ml-2" />
              {isExportingExcel ? (
                <span className="inline-flex items-center gap-1">
                  <span>
                    {excelStage === 'fetching'
                      ? 'טוען מוצרים…'
                      : excelStage === 'generating'
                      ? 'מייצר קובץ…'
                      : excelStage === 'downloading'
                      ? 'מוריד קובץ…'
                      : 'מכין קובץ…'}
                  </span>
                  {excelStage !== 'downloading' && (
                    <span className="inline-block w-10 text-right tabular-nums">
                      {excelProgress}%
                    </span>
                  )}
                </span>
              ) : (
                'ייצא מוצרים'
              )}
            </Button>

            {/* PDF export */}
            <Button
              onClick={handleDownloadPdf}
              variant="outline"
              size="lg"
              className="shadow-md hover:shadow-lg min-w-[160px]"
              disabled={isExportingPdf}
            >
              <FileText className="w-4 h-4 ml-2" />
              {isExportingPdf ? (
                <span className="inline-flex items-center gap-1">
                  <span>
                    {pdfStage === 'fetching'
                      ? 'טוען מוצרים…'
                      : pdfStage === 'generating'
                      ? 'מייצר PDF…'
                      : pdfStage === 'downloading'
                      ? 'מוריד קובץ…'
                      : 'מכין PDF…'}
                  </span>
                  {pdfStage !== 'downloading' && (
                    <span className="inline-block w-10 text-right tabular-nums">
                      {pdfProgress}%
                    </span>
                  )}
                </span>
              ) : (
                'ייצא PDF'
              )}
            </Button>
          </div>

          {/* Mobile actions */}
          <div className="flex flex-col gap-2 w-full sm:hidden">
            {/* Row 1: Add product */}
            <Button
              onClick={() => navigate('/products/new')}
              size="default"
              className="shadow-md hover:shadow-lg w-full"
            >
              <Plus className="w-4 h-4 ml-2" />
              הוסף מוצר
            </Button>

            {/* Row 2: Export actions (Excel, PDF, Print) */}
            <div className="flex gap-2 w-full">
              <Button
                onClick={handleExport}
                variant="outline"
                size="default"
                className="shadow-md hover:shadow-lg flex-1 flex items-center justify-center gap-2 min-w-[120px]"
                aria-label={
                  isExportingExcel
                    ? excelStage === 'fetching'
                      ? `טוען מוצרים… ${excelProgress}%`
                      : excelStage === 'generating'
                      ? `מייצר קובץ… ${excelProgress}%`
                      : excelStage === 'downloading'
                      ? 'מוריד קובץ…'
                      : `מכין קובץ… ${excelProgress}%`
                    : 'ייצא מוצרים (Excel)'
                }
                title={
                  isExportingExcel
                    ? excelStage === 'fetching'
                      ? `טוען מוצרים… ${excelProgress}%`
                      : excelStage === 'generating'
                      ? `מייצר קובץ… ${excelProgress}%`
                      : excelStage === 'downloading'
                      ? 'מוריד קובץ…'
                      : `מכין קובץ… ${excelProgress}%`
                    : 'ייצא מוצרים (Excel)'
                }
                disabled={isExportingExcel}
              >
                <Download className="w-4 h-4" />
                <span className="text-sm">
                  {isExportingExcel ? (
                    excelStage === 'downloading' ? (
                      'מוריד...'
                    ) : (
                      <span className="inline-block w-10 text-center tabular-nums">
                        {excelProgress}%
                      </span>
                    )
                  ) : (
                    'אקסל'
                  )}
                </span>
              </Button>
              <Button
                onClick={handleDownloadPdf}
                variant="outline"
                size="default"
                className="shadow-md hover:shadow-lg flex-1 flex items-center justify-center gap-2 min-w-[120px]"
                aria-label={
                  isExportingPdf
                    ? pdfStage === 'fetching'
                      ? `טוען מוצרים… ${pdfProgress}%`
                      : pdfStage === 'generating'
                      ? `מייצר PDF… ${pdfProgress}%`
                      : pdfStage === 'downloading'
                      ? 'מוריד קובץ…'
                      : `מכין PDF… ${pdfProgress}%`
                    : 'ייצא PDF'
                }
                title={
                  isExportingPdf
                    ? pdfStage === 'fetching'
                      ? `טוען מוצרים… ${pdfProgress}%`
                      : pdfStage === 'generating'
                      ? `מייצר PDF… ${pdfProgress}%`
                      : pdfStage === 'downloading'
                      ? 'מוריד קובץ…'
                      : `מכין PDF… ${pdfProgress}%`
                    : 'ייצא PDF'
                }
                disabled={isExportingPdf}
              >
                <FileText className="w-4 h-4" />
                <span className="text-sm">
                  {isExportingPdf ? (
                    pdfStage === 'downloading' ? (
                      'מוריד...'
                    ) : (
                      <span className="inline-block w-10 text-center tabular-nums">
                        {pdfProgress}%
                      </span>
                    )
                  ) : (
                    'PDF'
                  )}
                </span>
              </Button>
              {/* <Button
                onClick={() => window.print()}
                variant="outline"
                size="icon"
                className="shadow-md hover:shadow-lg flex-1"
                aria-label="הדפסה"
                title="הדפסה"
              >
                <Printer className="w-4 h-4" />
              </Button> */}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="shadow-md border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold">חיפוש וסינון</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* First row: Search and Sort */}
            <div className="grid grid-cols-10 gap-4">
              <div className="space-y-2 col-span-7">
                <Label className="text-sm font-medium">חיפוש</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="חיפוש לפי שם מוצר או מק&quot;ט..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>
              <div className="space-y-2 col-span-3">
                <Label className="text-sm font-medium">מיון</Label>
                <Select
                  value={sort}
                  onChange={(e) => handleSortChange(e.target.value as SortOption)}
                >
                  <option value="updated_desc">עודכן לאחרונה (חדש→ישן)</option>
                  <option value="updated_asc">עודכן לאחרונה (ישן→חדש)</option>
                  <option value="price_asc">מחיר (נמוך→גבוה)</option>
                  <option value="price_desc">מחיר (גבוה→נמוך)</option>
                </Select>
              </div>
            </div>
            {/* Second row: Supplier and Category */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">ספק</Label>
                <Select
                  value={supplierFilter}
                  onChange={(e) => handleSupplierFilterChange(e.target.value)}
                >
                  <option value="">כל הספקים</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">קטגוריה</Label>
                <Select
                  value={categoryFilter}
                  onChange={(e) => handleCategoryFilterChange(e.target.value)}
                >
                  <option value="">כל הקטגוריות</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products List */}
      {isLoading ? (
        <ProductsSkeleton rows={10} />
      ) : !products || products.length === 0 ? (
        <Card className="shadow-md border-2 border-dashed">
          <CardContent className="py-16 text-center">
            <div className="text-5xl mb-4">📦</div>
            <p className="text-lg font-bold text-foreground mb-2">לא נמצאו מוצרים</p>
            <p className="text-sm text-muted-foreground mb-6">התחל על ידי הוספת מוצר ראשון</p>
            <Button onClick={() => navigate('/products/new')} size="lg" className="shadow-md">
              <Plus className="w-4 h-4 ml-2" />
              הוסף מוצר ראשון
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {products.map((product) => (
            <Card key={product.id} className="shadow-md hover:shadow-lg transition-all border-2">
              <CardHeader className="pb-4 border-b-2 border-border/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold mb-2">{product.name}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md border border-border/50">
                        {product.category?.name || 'ללא קטגוריה'}
                      </span>
                      <span>•</span>
                      <span className="px-2 py-1 bg-muted rounded-md border border-border/50">{product.unit === 'unit' ? 'יחידה' : product.unit === 'kg' ? 'ק"ג' : 'ליטר'}</span>
                      {product.sku && (
                        <>
                          <span>•</span>
                          <span className="px-2 py-1 bg-muted rounded-md border border-border/50">מק&quot;ט: {product.sku}</span>
                        </>
                      )}
                      {/* package_quantity is now per supplier (in price_entries), not per product */}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/products/${product.id}/edit`, { state: { product } })}
                      className="shadow-sm border-2"
                    >
                      <Edit className="w-4 h-4 ml-1" />
                      ערוך
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setProductToDelete({ id: product.id, name: product.name });
                        setDeleteDialogOpen(true);
                      }}
                      className="shadow-sm border-2 border-destructive/20"
                    >
                      <Trash2 className="w-4 h-4 ml-1" />
                      מחק
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getProductDerivedSummary(product) && (
                    (() => {
                      const summary = getProductDerivedSummary(product);
                      if (!summary) return null;
                      return (
                    <div className="flex flex-wrap gap-4 text-sm p-4 bg-linear-to-r from-primary/5 to-primary/10 rounded-lg border-2 border-primary/20 shadow-sm">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">מחיר נמוך ביותר:</span>
                        <span className="font-semibold text-foreground">{formatPrice(Number(summary.minCost ?? 0))}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">עודכן לאחרונה:</span>
                        <span className="font-semibold text-foreground">{summary.lastUpdated ? formatDate(summary.lastUpdated) : '-'}</span>
                      </div>
                    </div>
                      );
                    })()
                  )}

                  {product.prices && product.prices.length > 0 ? (
                    <div>
                      <h4 className="text-base font-bold mb-4 text-foreground">מחירים לפי ספק (נמוך ראשון):</h4>
                      <div className="overflow-x-auto rounded-lg border border-border bg-card">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-b border-border">
                              <TableHead className="font-semibold">ספק</TableHead>
                              <TableHead className="font-semibold">מחיר עלות</TableHead>
                              <TableHead className="font-semibold">מחיר לקרטון</TableHead>
                              <TableHead className="w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {product.prices.map((price) => {
                              const priceId = `${product.id}-${price.supplier_id}-${price.created_at}`;
                              const isExpanded = expandedPriceId === priceId;
                              
                              // Calculate values for display
                              const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
                              const packageQty = Number(price.package_quantity) || 1;
                              const cartonPrice = costAfterDiscount * packageQty;
                              const costPriceNet = useVat && costAfterDiscount > 0 && vatPercent > 0
                                ? grossToNet(costAfterDiscount, vatPercent / 100)
                                : costAfterDiscount;
                              const costPriceBeforeDiscountNet = useVat && Number(price.cost_price) > 0 && vatPercent > 0
                                ? grossToNet(Number(price.cost_price), vatPercent / 100)
                                : Number(price.cost_price);
                              
                              // Prepare fields for accordion content (with labels)
                              const fields = [
                                { label: 'מחיר עלות כולל מע"מ', value: `₪${formatUnitPrice(Number(price.cost_price))}` },
                                ...(useVat ? [{ label: 'מחיר עלות ללא מע"מ', value: `₪${formatUnitPrice(costPriceBeforeDiscountNet)}` }] : []),
                                ...(price.discount_percent && Number(price.discount_percent) > 0 ? [{ label: 'אחוז הנחה', value: `${Number(price.discount_percent).toFixed(1)}%` }] : []),
                                { label: 'מחיר לאחר הנחה כולל מע"מ', value: `₪${formatUnitPrice(costAfterDiscount)}` },
                                ...(useVat ? [{ label: 'מחיר לאחר הנחה ללא מע"מ', value: `₪${formatUnitPrice(costPriceNet)}` }] : []),
                                { label: 'כמות יחידות בקרטון', value: `${packageQty} יחידות` },
                                ...(useMargin && price.sell_price ? [{ label: 'מחיר מכירה', value: `₪${formatUnitPrice(Number(price.sell_price))}`, highlight: true }] : []),
                                ...(useMargin && price.margin_percent ? [{ label: 'אחוז רווח', value: `${Number(price.margin_percent).toFixed(1)}%` }] : []),
                              ];
                              
                              return (
                                <React.Fragment key={priceId}>
                                  <TableRow 
                                    className="cursor-pointer hover:bg-muted/50 active:bg-muted border-b border-border touch-manipulation"
                                    onClick={() => setExpandedPriceId(isExpanded ? null : priceId)}
                                  >
                                    <TableCell className="font-semibold">{price.supplier_name || 'לא ידוע'}</TableCell>
                                    <TableCell>₪{formatUnitPrice(Number(price.cost_price))}</TableCell>
                                    <TableCell className="text-primary font-medium">₪{formatCostPrice(cartonPrice)}</TableCell>
                                    <TableCell>
                                      <ChevronDown
                                        className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                                          isExpanded ? 'transform rotate-180' : ''
                                        }`}
                                      />
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && (
                                    <TableRow>
                                      <TableCell colSpan={4} className="p-0 border-b border-border">
                                        <div className="p-4 bg-muted/30">
                                          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                            {fields.map((field, idx) => (
                                              <div key={idx} className="flex items-center gap-2 border-b border-border/50 pb-2">
                                                <span className="text-sm font-medium text-muted-foreground">{field.label}</span>
                                                <span className={`text-sm font-semibold ${field.highlight ? 'text-primary' : 'text-foreground'}`}>{field.value}</span>
                                              </div>
                                            ))}
                                          </div>
                                          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setHistoryProductId(product.id);
                                                setHistorySupplierId(price.supplier_id);
                                                setHistoryOpen(true);
                                              }}
                                            >
                                              <FileText className="w-4 h-4 ml-1" />
                                              היסטוריית מחירים
                                            </Button>
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      אין מחירים למוצר זה
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center justify-center gap-4 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              קודם
            </Button>
            <span className="text-xs text-muted-foreground">
              עמוד {currentPage} מתוך {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              הבא
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת מוצר</DialogTitle>
          </DialogHeader>
          <p>האם אתה בטוח שברצונך למחוק את המוצר "{productToDelete?.name}"?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteProduct.isPending}>
              {deleteProduct.isPending ? 'מוחק...' : 'מחק'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price history dialog */}
      <Dialog open={historyOpen} onOpenChange={(open) => (open ? setHistoryOpen(true) : closeHistory())}>
        <DialogContent>
          <div className="flex items-center justify-between mb-4">
            <DialogHeader className="flex-1">
              <DialogTitle>היסטוריית מחירים</DialogTitle>
            </DialogHeader>
            {historyProductId && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { columns } = await getPriceTableExportLayout(appSettings, 'priceHistoryTable');
                    
                    // Make sure product name is always included in price history exports,
                    // regardless of the saved column layout.
                    const baseColumns = [
                      ...columns,
                      { key: 'product_name', label: 'שם מוצר' },
                    ];

                    // Add SKU column if product has SKU
                    const product = products.find((p) => p.id === historyProductId);
                    const exportColumns = product?.sku
                      ? [
                          ...baseColumns,
                          { key: 'sku', label: 'מק״ט' },
                        ]
                      : baseColumns;
                    
                    const columnKeys = exportColumns.map((c) => c.key);
                    const rowObjects = (priceHistory || []).map((price) =>
                      priceRowToExportValues({ price, product, settings: appSettings, columnKeys })
                    );

                    await downloadTablePdf({
                      storeName: currentTenant?.name || 'Stockly',
                      title: 'היסטוריית מחירים',
                      columns: exportColumns.map((c) => ({
                        key: c.key,
                        label: c.label,
                      })),
                      rows: rowObjects,
                      filename: 'price_history.pdf',
                    });
                  } catch (error) {
                    console.error('Error exporting price history PDF:', error);
                    alert('שגיאה בייצוא PDF');
                  }
                }}
              >
                <FileText className="w-4 h-4 ml-2" />
                ייצא PDF
              </Button>
            )}
          </div>
          {historyLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              טוען היסטוריית מחירים...
            </div>
          ) : priceHistory.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              לא נמצאה היסטוריית מחירים עבור ספק זה.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border-2 border-border shadow-sm max-h-[400px]">
              <Table>
                <TableHeader>
                    <TableRow className="bg-linear-to-r from-muted to-muted/50 border-b-2">
                    <TableHead className="whitespace-nowrap">תאריך</TableHead>
                    <TableHead className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        מחיר עלות
                        {useVat && <Tooltip content="מחיר עלות כולל מע&quot;מ" />}
                      </div>
                    </TableHead>
                    {useVat && (
                      <TableHead className="whitespace-nowrap">
                        <div>מחיר לפני מע&quot;מ</div>
                      </TableHead>
                    )}
                    <TableHead className="whitespace-nowrap">הנחה</TableHead>
                    <TableHead className="whitespace-nowrap">
                      <div>מחיר לאחר הנחה</div>
                      {useVat && <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(כולל מע&quot;מ)</div>}
                    </TableHead>
                    {useVat && (
                      <TableHead className="whitespace-nowrap">
                        <div>מחיר לאחר הנחה</div>
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(לפני מע&quot;מ)</div>
                      </TableHead>
                    )}
                    <TableHead className="whitespace-nowrap">כמות בקרטון</TableHead>
                    <TableHead className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        מחיר לקרטון
                        <Tooltip content="מחיר עלות כולל מע&quot;מ × כמות בקרטון" />
                      </div>
                    </TableHead>
                    {useMargin && (
                      <TableHead className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          מחיר מכירה
                          <Tooltip content="מחיר עלות + מע&quot;מ + רווח" />
                        </div>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistory.map((row) => {
                    // cost_price is ALWAYS stored with VAT (if use_vat is true) or as-is (if use_vat is false)
                    const costPriceWithVat = Number(row.cost_price);
                    // Calculate price before VAT if useVat is true
                    const costPriceBeforeVat = useVat && settings?.vat_percent && settings.vat_percent > 0
                      ? costPriceWithVat / (1 + settings.vat_percent / 100)
                      : costPriceWithVat;
                    
                    // cost_price_after_discount is also stored with VAT (if use_vat is true)
                    const costAfterDiscountWithVat = Number(row.cost_price_after_discount || row.cost_price);
                    const costAfterDiscountBeforeVat = useVat && settings?.vat_percent && settings.vat_percent > 0
                      ? costAfterDiscountWithVat / (1 + settings.vat_percent / 100)
                      : costAfterDiscountWithVat;
                    
                    // For carton price, use net price (before VAT) if useVat is true, otherwise use gross
                    const unitPrice = useVat ? costAfterDiscountBeforeVat : costAfterDiscountWithVat;
                    
                    // package_quantity is now per supplier (from price_entries), not per product
                    const packageQty = Number(row.package_quantity) || 1;
                    const cartonPrice = unitPrice * packageQty;
                    
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
                        <TableCell className="whitespace-nowrap">₪{formatCostPrice(costPriceWithVat)}</TableCell>
                        {useVat && (
                          <TableCell className="whitespace-nowrap">₪{formatCostPrice(costPriceBeforeVat)}</TableCell>
                        )}
                        <TableCell className="whitespace-nowrap text-center">
                          {row.discount_percent && Number(row.discount_percent) > 0 
                            ? `${Number(row.discount_percent).toFixed(1)}%`
                            : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">₪{formatCostPrice(costAfterDiscountWithVat)}</TableCell>
                        {useVat && (
                          <TableCell className="whitespace-nowrap">₪{formatCostPrice(costAfterDiscountBeforeVat)}</TableCell>
                        )}
                        <TableCell className="whitespace-nowrap">{packageQty} יח`</TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">
                          <div>₪{formatUnitPrice(cartonPrice)}</div>
                        </TableCell>
                        {useMargin && (
                          <TableCell className="font-bold text-primary whitespace-nowrap">
                            ₪{formatUnitPrice(Number(row.sell_price))}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
