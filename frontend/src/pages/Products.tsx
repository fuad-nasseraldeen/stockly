import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Plus, Search, Edit, Trash2, DollarSign, Calendar, Download, FileText } from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { exportApi, productsApi } from '../lib/api';
import { PriceTable } from '../components/price-table/PriceTable';
import { resolveColumns, getDefaultLayout, type Settings as SettingsType } from '../lib/column-resolver';
import { loadLayout, mergeWithDefaults } from '../lib/column-layout-storage';
import { downloadTablePdf } from '../lib/pdf-service';
import { getPriceTableExportLayout, priceRowToExportValues } from '../lib/pdf-price-table';
import { useTenant } from '../hooks/useTenant';

type SortOption = 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc';

export default function Products() {
  const navigate = useNavigate();
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
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStage, setPdfStage] = useState<'idle' | 'fetching' | 'generating' | 'downloading'>('idle');

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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(price);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('he-IL');
  };

  const useVat = settings?.use_vat === true; // Default to false if not set
  const useMargin = settings?.use_margin === true; // Default to false if not set
  
  // Column layout management - loads from database
  const [columnLayout, setColumnLayout] = useState<ReturnType<typeof getDefaultLayout> | null>(null);
  
  const vatPercent = settings?.vat_percent ?? 18;
  const appSettings: SettingsType = {
    use_vat: useVat,
    use_margin: useMargin,
    vat_percent: vatPercent,
    global_margin_percent: settings?.global_margin_percent ?? undefined,
  };
  
  // Load layout from database on mount
  useEffect(() => {
    const loadLayoutData = async () => {
      try {
        const saved = await loadLayout();
        const layout = saved ? mergeWithDefaults(saved) : getDefaultLayout(appSettings);
        setColumnLayout(layout);
      } catch (error) {
        console.error('Failed to load column layout:', error);
        setColumnLayout(getDefaultLayout(appSettings));
      }
    };
    
    loadLayoutData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Listen for layout changes
  useEffect(() => {
    const handleLayoutChange = async () => {
      try {
        const saved = await loadLayout();
        const layout = saved ? mergeWithDefaults(saved) : getDefaultLayout(appSettings);
        setColumnLayout(layout);
      } catch (error) {
        console.error('Failed to reload column layout:', error);
      }
    };
    
    window.addEventListener('priceTableLayoutChanged', handleLayoutChange);
    return () => {
      window.removeEventListener('priceTableLayoutChanged', handleLayoutChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const availableColumns = columnLayout ? resolveColumns(appSettings, columnLayout) : [];

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
    try {
      await exportApi.downloadFiltered({
        search: debouncedSearch || undefined,
        supplier_id: supplierFilter || undefined,
        category_id: categoryFilter || undefined,
        sort,
      });
    } catch (error) {
      console.error('Error exporting:', error);
      alert('שגיאה בייצוא הקובץ');
    }
  };

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;

    let generatingIntervalId: number | undefined;

    try {
      setIsExportingPdf(true);
      setPdfStage('fetching');
      setPdfProgress(0);

      // Fetch ALL products matching current filters (across all pages)
      const allProducts: any[] = [];
      let pageToFetch = 1;
      const pageSizeForExport = 200; // larger page size for export
      let totalProductsForExport = 0;
      let totalPagesForExport = 0;

      for (;;) {
        const response = await productsApi.list({
          search: debouncedSearch || undefined,
          supplier_id: supplierFilter || undefined,
          category_id: categoryFilter || undefined,
          sort,
          page: pageToFetch,
          pageSize: pageSizeForExport,
        });

        allProducts.push(...(response.products || []));
        totalProductsForExport = response.total ?? totalProductsForExport ?? 0;
        totalPagesForExport = response.totalPages ?? totalPagesForExport ?? 0;

        // Real fetch progress: based on number of pages / products loaded
        if (totalProductsForExport > 0) {
          const loadedCount = allProducts.length;
          const fetchProgress = Math.min(
            75,
            Math.round((loadedCount / totalProductsForExport) * 75)
          );
          setPdfProgress(fetchProgress);
        } else if (totalPagesForExport > 0) {
          const pagesLoaded = pageToFetch;
          const fetchProgress = Math.min(
            75,
            Math.round((pagesLoaded / totalPagesForExport) * 75)
          );
          setPdfProgress(fetchProgress);
        }

        if (!response.totalPages || pageToFetch >= response.totalPages) {
          break;
        }

        pageToFetch += 1;
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
          // צעד קטן קדימה
          const next = current + 1.5;
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
        return prices.map((price: any) =>
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
              className="shadow-md hover:shadow-lg"
            >
              <Download className="w-4 h-4 ml-2" />
              ייצא מוצרים
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
                className="shadow-md hover:shadow-lg flex-1 flex items-center justify-center gap-2"
                aria-label="ייצא מוצרים (Excel)"
                title="ייצא מוצרים (Excel)"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm">אקסל</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
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
        </CardContent>
      </Card>

      {/* Products List */}
      {isLoading ? (
        <Card className="shadow-md border-2">
          <CardContent className="py-12 text-center">
            <div className="inline-block h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-muted-foreground">טוען מוצרים...</p>
          </CardContent>
        </Card>
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
                      {product.package_quantity && Number(product.package_quantity) !== 1 && (
                        <>
                          <span>•</span>
                          <span className="px-2 py-1 bg-muted rounded-md border border-border/50">כמות באריזה: {product.package_quantity}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/products/${product.id}/edit`)}
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
                  {product.summary && (
                    <div className="flex flex-wrap gap-4 text-sm p-4 bg-linear-to-r from-primary/5 to-primary/10 rounded-lg border-2 border-primary/20 shadow-sm">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">מחיר נמוך ביותר:</span>
                        <span className="font-semibold text-foreground">{formatPrice(Number(product.summary.min_current_cost_price))}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">עודכן לאחרונה:</span>
                        <span className="font-semibold text-foreground">{formatDate(product.summary.last_price_update_at)}</span>
                      </div>
                    </div>
                  )}

                  {product.prices && product.prices.length > 0 ? (
                    <div>
                      <h4 className="text-base font-bold mb-4 text-foreground">מחירים לפי ספק (נמוך ראשון):</h4>
                      <div className="overflow-x-auto rounded-lg border-2 border-border shadow-sm">
                        {availableColumns.length > 0 ? (
                          <PriceTable
                            prices={product.prices}
                            product={product}
                            settings={appSettings}
                            columns={availableColumns}
                            renderActions={(price) => (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setHistoryProductId(product.id);
                                  setHistorySupplierId(price.supplier_id);
                                  setHistoryOpen(true);
                                }}
                              >
                                היסטוריית מחירים
                              </Button>
                            )}
                          />
                        ) : (
                          <div className="p-4 text-center text-muted-foreground">טוען תבנית עמודות...</div>
                        )}
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
                    
                    // Add SKU column if product has SKU
                    const product = products.find((p) => p.id === historyProductId);
                    const exportColumns = product?.sku
                      ? [
                          ...columns,
                          { key: 'sku', label: 'מק״ט' },
                        ]
                      : columns;
                    
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
                        <TableCell className="whitespace-nowrap">{formatPrice(costPriceWithVat)}</TableCell>
                        {useVat && (
                          <TableCell className="whitespace-nowrap">{formatPrice(costPriceBeforeVat)}</TableCell>
                        )}
                        <TableCell className="whitespace-nowrap text-center">
                          {row.discount_percent && Number(row.discount_percent) > 0 
                            ? `${Number(row.discount_percent).toFixed(1)}%`
                            : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatPrice(costAfterDiscountWithVat)}</TableCell>
                        {useVat && (
                          <TableCell className="whitespace-nowrap">{formatPrice(costAfterDiscountBeforeVat)}</TableCell>
                        )}
                        <TableCell className="whitespace-nowrap">{packageQty} יח`</TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">
                          <div>{formatPrice(cartonPrice)}</div>
                        </TableCell>
                        {useMargin && (
                          <TableCell className="font-bold text-primary whitespace-nowrap">
                            {formatPrice(Number(row.sell_price))}
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
