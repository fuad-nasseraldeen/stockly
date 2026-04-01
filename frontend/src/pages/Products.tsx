import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useProducts, useDeleteProduct, useProductPriceHistory, useAddProductPrice } from '../hooks/useProducts';
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
import { InfoTooltip } from '../components/help/InfoTooltip';
import { productsApi, stockApi, type Product, type ProductSupplierStockRow } from '../lib/api';
import { getAvailableColumns, type Settings as SettingsType } from '../lib/column-resolver';
import { downloadTablePdf } from '../lib/pdf-service';
import { getPriceTableExportLayout, priceRowToExportValues } from '../lib/pdf-price-table';
import { useTenant } from '../hooks/useTenant';
import { ProductsSkeleton } from '../components/ProductsSkeleton';
import { grossToNet, netToGross } from '../lib/pricing-rules';
import { useTableLayout } from '../hooks/useTableLayout';
import type { FieldOption } from '../components/FieldLayoutEditor/fieldLayoutTypes';
import { normalizePinnedFieldIds, parsePinnedFieldIdsFromSavedLayout } from '../components/FieldLayoutEditor/fieldLayoutUtils';
import { formatNumberTrimmed, getDecimalPrecision, priceInputPlaceholder, priceInputStep } from '../lib/number-format';

type SortOption = 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc';

function ScrollablePriceTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    canScroll: false,
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
  });

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const canScroll = scrollWidth > clientWidth;
    setScrollState({
      canScroll,
      scrollLeft,
      scrollWidth,
      clientWidth,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener('scroll', updateScroll);
    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScroll);
      ro.disconnect();
    };
  }, [updateScroll]);

  const { canScroll, scrollLeft, scrollWidth, clientWidth } = scrollState;
  const scrollable = Math.max(0, scrollWidth - clientWidth);
  const thumbRatio = clientWidth > 0 && scrollWidth > 0 ? clientWidth / scrollWidth : 1;
  const thumbWidthPercent = Math.min(100, Math.max(15, thumbRatio * 100));
  const maxOffset = 100 - thumbWidthPercent;
  const isRtl = typeof document !== 'undefined' && (document.documentElement.dir === 'rtl' || document.documentElement.getAttribute('dir') === 'rtl');
  const scrollProgress = scrollable > 0 ? Math.max(0, Math.min(1, (isRtl ? -scrollLeft : scrollLeft) / scrollable)) : 0;
  const thumbOffsetPercent = isRtl ? (1 - scrollProgress) * maxOffset : scrollProgress * maxOffset;

  return (
    <div className={`${className} rounded-lg border border-border bg-card overflow-hidden`}>
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden max-w-full scrollbar-hide"
      >
        {children}
      </div>
      {canScroll && (
        <div
          className="h-1 w-full overflow-hidden"
          role="scrollbar"
          aria-hidden
          dir="ltr"
        >
          <div
            className="h-full rounded-full bg-primary/60 transition-all duration-150"
            style={{
              width: `${thumbWidthPercent}%`,
              marginLeft: `${thumbOffsetPercent}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

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

function formatStockQty(n: number, decimals: number): string {
  return formatNumberTrimmed(n, decimals);
}

/** Alert when אזל / בסף (תואם list_low_stock: min>0 ∧ qty≤min, או מלאי 0). */
function stockRowDisplayState(
  row: ProductSupplierStockRow | undefined,
  decimals: number,
  opts: { enabled: boolean; isPending: boolean; isFetched: boolean },
): { text: string; isAlert: boolean } {
  if (!opts.enabled) return { text: '', isAlert: false };
  if (opts.isPending && !opts.isFetched) return { text: '…', isAlert: false };
  if (row === undefined) return { text: '—', isAlert: false };
  const qty = Number(row.stock_quantity);
  const minT = Number(row.min_threshold);
  const isAlert = qty <= 0 || (minT > 0 && qty <= minT);
  const text =
    minT > 0
      ? `${formatStockQty(qty, decimals)} / ${formatStockQty(minT, decimals)}`
      : formatStockQty(qty, decimals);
  return { text, isAlert };
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
  const [showInlineAddPriceDialog, setShowInlineAddPriceDialog] = useState(false);
  const [productForInlineAdd, setProductForInlineAdd] = useState<Product | null>(null);
  const [inlinePriceSupplierId, setInlinePriceSupplierId] = useState('');
  const [inlinePriceCost, setInlinePriceCost] = useState('0');
  const [inlinePriceCartonPrice, setInlinePriceCartonPrice] = useState('0');
  const [inlinePriceIncludesVat, setInlinePriceIncludesVat] = useState<'with' | 'without'>('with');
  const [inlinePriceDiscount, setInlinePriceDiscount] = useState('0');
  const [inlinePricePackageQuantity, setInlinePricePackageQuantity] = useState('1');
  const [inlinePricePackageType, setInlinePricePackageType] = useState<
    'carton' | 'gallon' | 'bag' | 'bottle' | 'pack' | 'shrink' | 'sachet' | 'can' | 'roll' | 'unknown'
  >('unknown');
  const [inlinePriceError, setInlinePriceError] = useState<string | null>(null);
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

  const goToPage = (nextPage: number): void => {
    setPage(nextPage);
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  };

  const { data: suppliers = [] } = useSuppliers();
  const { data: categories = [] } = useCategories();
  const { data: settings } = useSettings();
  const stockTrackingEnabled = settings?.stock_tracking_enabled === true;
  const stockQueries = useQueries({
    queries: products.map((p) => ({
      queryKey: ['stock', 'product', p.id] as const,
      queryFn: () => stockApi.getForProduct(p.id),
      enabled: stockTrackingEnabled && !!p.id,
    })),
  });
  const {
    data: priceHistory = [],
    isLoading: historyLoading,
    isError: historyIsError,
    error: historyError,
  } = useProductPriceHistory(
    historyProductId || '',
    historySupplierId || undefined
  );
  const deleteProduct = useDeleteProduct();
  const addProductPrice = useAddProductPrice();


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

  const resetInlineAddPriceForm = () => {
    setInlinePriceSupplierId('');
    setInlinePriceCost('0');
    setInlinePriceCartonPrice('0');
    setInlinePriceIncludesVat('with');
    setInlinePriceDiscount('0');
    setInlinePricePackageQuantity('1');
    setInlinePricePackageType('unknown');
    setInlinePriceError(null);
  };

  const openInlineAddPriceDialog = (product: Product) => {
    setProductForInlineAdd(product);
    resetInlineAddPriceForm();
    setShowInlineAddPriceDialog(true);
  };

  const decimalPrecision = getDecimalPrecision(settings);
  const formatCostPrice = (num: number): string => formatNumberTrimmed(num, decimalPrecision);
  const formatUnitPrice = (num: number): string => formatNumberTrimmed(num, decimalPrecision);

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('he-IL');
  };

  const useVat = settings?.use_vat === true;
  const useMargin = settings?.use_margin === true; // Default to false if not set
  const vatPercent = settings?.vat_percent ?? 18;

  const parseInlineNumber = (v: string): number => (v ? Number(v) || 0 : 0);
  const inlinePackageQty = parseInlineNumber(inlinePricePackageQuantity) || 1;
  const inlineCartonPriceValue = parseInlineNumber(inlinePriceCartonPrice);
  const inlineCalculatedUnitPrice = inlineCartonPriceValue > 0 && inlinePackageQty > 0
    ? inlineCartonPriceValue / inlinePackageQty
    : parseInlineNumber(inlinePriceCost);
  const inlineCostPriceGross = useVat && inlineCalculatedUnitPrice > 0 && inlinePriceIncludesVat === 'without'
    ? netToGross(inlineCalculatedUnitPrice, vatPercent / 100)
    : inlineCalculatedUnitPrice;
  const inlineDiscountValue = parseInlineNumber(inlinePriceDiscount);
  const inlineCostAfterDiscountGross = inlineCostPriceGross > 0 && inlineDiscountValue > 0
    ? inlineCostPriceGross * (1 - inlineDiscountValue / 100)
    : inlineCostPriceGross;
  const inlineCostAfterDiscountNet = useVat && inlineCostAfterDiscountGross > 0 && vatPercent > 0
    ? grossToNet(inlineCostAfterDiscountGross, vatPercent / 100)
    : inlineCostAfterDiscountGross;
  const inlineCartonTotal = inlineCostAfterDiscountGross * inlinePackageQty;

  const handleInlineUnitPriceChange = (value: string) => {
    setInlinePriceCost(value);
    const unitPriceNum = parseInlineNumber(value);
    if (unitPriceNum > 0 && inlinePackageQty > 0) {
      const calculatedCarton = unitPriceNum * inlinePackageQty;
      setInlinePriceCartonPrice(formatUnitPrice(calculatedCarton));
    }
  };

  const handleInlineCartonPriceChange = (value: string) => {
    setInlinePriceCartonPrice(value);
    const cartonNum = parseInlineNumber(value);
    if (cartonNum > 0 && inlinePackageQty > 0) {
      const calculatedUnit = cartonNum / inlinePackageQty;
      setInlinePriceCost(formatUnitPrice(calculatedUnit));
    }
  };

  const handleInlinePackageQtyChange = (value: string) => {
    setInlinePricePackageQuantity(value);
    const qtyNum = parseInlineNumber(value);
    if (qtyNum <= 0) return;

    const cartonNum = parseInlineNumber(inlinePriceCartonPrice);
    if (cartonNum > 0) {
      const calculatedUnit = cartonNum / qtyNum;
      setInlinePriceCost(formatUnitPrice(calculatedUnit));
      return;
    }

    const unitNum = parseInlineNumber(inlinePriceCost);
    if (unitNum > 0) {
      const calculatedCarton = unitNum * qtyNum;
      setInlinePriceCartonPrice(formatUnitPrice(calculatedCarton));
    }
  };

  const handleInlineAddPrice = async (): Promise<void> => {
    if (!productForInlineAdd) return;
    if (!inlinePriceSupplierId) {
      setInlinePriceError('חובה לבחור ספק');
      return;
    }

    const finalUnitPrice = inlineCalculatedUnitPrice;
    if (!finalUnitPrice || finalUnitPrice <= 0) {
      setInlinePriceError('חובה להזין מחיר עלות תקין או מחיר אריזה');
      return;
    }

    try {
      setInlinePriceError(null);
      const costPriceToStore = useVat && finalUnitPrice > 0 && inlinePriceIncludesVat === 'without'
        ? netToGross(finalUnitPrice, vatPercent / 100)
        : finalUnitPrice;

      await addProductPrice.mutateAsync({
        id: productForInlineAdd.id,
        data: {
          supplier_id: inlinePriceSupplierId,
          cost_price: costPriceToStore,
          discount_percent: inlinePriceDiscount ? Number(inlinePriceDiscount) : undefined,
          package_quantity: inlinePricePackageQuantity ? Number(inlinePricePackageQuantity) : undefined,
          package_type: inlinePricePackageType,
        },
      });

      setShowInlineAddPriceDialog(false);
      resetInlineAddPriceForm();
      setProductForInlineAdd(null);
      await queryClient.refetchQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock', 'product', productForInlineAdd.id] });
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : null;
      setInlinePriceError(message || 'שגיאה בהוספת מחיר');
    }
  };

  const formatPackageType = (packageType?: string | null) => {
    if (!packageType) return 'לא ידוע';
    const normalized = packageType.toLowerCase();
    if (normalized === 'carton') return 'קרטון';
    if (normalized === 'gallon') return 'גלון';
    if (normalized === 'bag') return 'שק';
    if (normalized === 'bottle') return 'בקבוק';
    if (normalized === 'pack') return 'מארז';
    if (normalized === 'shrink') return 'שרינק';
    if (normalized === 'sachet') return 'שקית';
    if (normalized === 'can') return 'פחית/קופסה';
    if (normalized === 'roll') return 'גליל';
    return 'לא ידוע';
  };

  const appSettings: SettingsType = useMemo(() => ({
    use_vat: useVat,
    use_margin: useMargin,
    vat_percent: vatPercent,
    global_margin_percent: settings?.global_margin_percent ?? undefined,
    decimal_precision: settings?.decimal_precision ?? null,
  }), [useVat, useMargin, vatPercent, settings?.global_margin_percent, settings?.decimal_precision]);
  const { data: savedLayout } = useTableLayout('productsTable');
  const availableColumns = useMemo(
    () =>
      getAvailableColumns(appSettings).filter(
        (col) => col.id !== 'actions',
      ),
    [appSettings]
  );
  const allFields: FieldOption[] = useMemo(
    () => availableColumns.map((col) => ({ id: col.id, label: col.headerLabel })),
    [availableColumns]
  );
  const mobileSummaryColumns = useMemo(() => {
    const parsedPinned = parsePinnedFieldIdsFromSavedLayout(savedLayout as unknown, allFields);
    const defaultPinned = normalizePinnedFieldIds(
      allFields.slice(0, 3).map((field) => field.id),
      allFields
    );
    const pinned = parsedPinned.some((id) => !!id) ? parsedPinned : defaultPinned;
    const columnMap = new Map<string, (typeof availableColumns)[number]>(
      availableColumns.map((col) => [col.id, col])
    );
    return pinned
      .map((id) => (id ? columnMap.get(String(id)) : null))
      .filter((col): col is (typeof availableColumns)[number] => !!col);
  }, [allFields, availableColumns, savedLayout]);
  
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

      // Build CSV with Hebrew headers for Excel export
      const BOM = '\uFEFF';
      let csv =
        BOM +
        'שם מוצר,מק"ט,מחיר עלות,כמות באריזה,ספק,אחוז הנחה,מחיר אחרי הנחה,אחוז רווח,מחיר מכירה,קטגוריה,עודכן לאחרונה\n';

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
            `${costPrice},` +
            `${packageQty},` +
            `${csvEscape(supplierName)},` +
            `${discountPercent},` +
            `${costPriceAfterDiscount},` +
            `${marginPercent},` +
            `${sellPrice},` +
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
              <div className="space-y-2 col-span-6">
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
              <div className="space-y-2 col-span-4">
                <Label className="text-sm font-medium">מיין לפי</Label>
                <Select
                  value={sort}
                  onChange={(e) => handleSortChange(e.target.value as SortOption)}
                >
                  <option value="updated_desc">עודכן: חדש→ישן</option>
                  <option value="updated_asc">עודכן: ישן→חדש</option>
                  <option value="price_asc">מחיר: נמוך→גבוה</option>
                  <option value="price_desc">מחיר: גבוה→נמוך</option>
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
        <div className="space-y-5 min-w-0">
          {products.map((product, productIdx) => {
            const stockQ = stockQueries[productIdx];
            const stockRows = stockQ?.data?.rows;
            return (
            <Card key={product.id} className="shadow-md hover:shadow-lg transition-all border-2 min-w-0 overflow-hidden">
              <CardHeader className="pb-4 border-b-2 border-border/50">
                {(() => {
                  const firstPrice = Array.isArray(product.prices) && product.prices.length > 0 ? product.prices[0] : null;
                  const packageTypeLabel = formatPackageType(firstPrice?.package_type || null);
                  return (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold mb-2">{product.name}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md border border-border/50">
                        {product.category?.name || 'ללא קטגוריה'}
                      </span>
                      <span>•</span>
                      <span className="px-2 py-1 bg-muted rounded-md border border-border/50">
                        יחידת מידה: {product.unit === 'unit' ? 'יחידה' : product.unit === 'kg' ? 'ק"ג' : 'ליטר'}
                      </span>
                      <span>•</span>
                      <span className="px-2 py-1 bg-muted rounded-md border border-border/50">
                        סוג אריזה: {packageTypeLabel}
                      </span>
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
                  );
                })()}
              </CardHeader>
              <CardContent className="min-w-0 overflow-x-hidden">
                <div className="space-y-3 min-w-0">
                  {getProductDerivedSummary(product) && (
                    (() => {
                      const summary = getProductDerivedSummary(product);
                      if (!summary) return null;
                      return (
                    <div className="flex flex-wrap gap-4 text-sm p-4 bg-linear-to-r from-primary/5 to-primary/10 rounded-lg border-2 border-primary/20 shadow-sm">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">מחיר נמוך ביותר:</span>
                        <span className="font-semibold text-foreground">₪{formatUnitPrice(Number(summary.minCost ?? 0))}</span>
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

                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-bold text-foreground">מחירים לפי ספק (נמוך ראשון):</h4>
                    <Button
                      size="sm"
                      onClick={() => openInlineAddPriceDialog(product)}
                    >
                      <Plus className="w-4 h-4 ml-1" />
                      הוסף מחיר חדש
                    </Button>
                  </div>

                  {product.prices && product.prices.length > 0 ? (
                    <div className="min-w-0 overflow-x-hidden space-y-0">
                      <ScrollablePriceTable className="max-w-full">
                        <table className="w-full caption-bottom text-sm">
                          <TableHeader>
                            <TableRow className="border-b border-border">
                              {mobileSummaryColumns.map((col) => (
                                <TableHead key={col.id} className="font-semibold">
                                  {col.headerLabel}
                                </TableHead>
                              ))}
                              {stockTrackingEnabled && (
                                <TableHead className="font-semibold whitespace-nowrap text-left">מלאי</TableHead>
                              )}
                              <TableHead className="sticky left-0 z-10 w-6 min-w-6 p-0 bg-card border-r border-border">
                                <div className="flex items-center justify-center py-3">
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
                                </div>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {product.prices.map((price) => {
                              const priceId = `${product.id}-${price.supplier_id}-${price.created_at}`;
                              const isExpanded = expandedPriceId === priceId;
                              return (
                                <TableRow
                                  key={priceId}
                                  className="cursor-pointer hover:bg-muted/50 active:bg-muted border-b border-border touch-manipulation"
                                  onClick={() => setExpandedPriceId(isExpanded ? null : priceId)}
                                >
                                  {mobileSummaryColumns.map((col) => (
                                    <TableCell key={col.id} className={col.id === 'supplier' ? 'font-semibold' : undefined}>
                                      {col.renderCell(price, product, appSettings)}
                                    </TableCell>
                                  ))}
                                  {stockTrackingEnabled && (() => {
                                    const sRow = stockRows?.find((r) => r.supplier_id === price.supplier_id);
                                    const { text, isAlert } = stockRowDisplayState(sRow, decimalPrecision, {
                                      enabled: stockTrackingEnabled,
                                      isPending: stockQ?.isPending ?? false,
                                      isFetched: stockQ?.isFetched ?? false,
                                    });
                                    return (
                                      <TableCell
                                        className={`whitespace-nowrap text-left tabular-nums ${
                                          isAlert ? 'text-destructive font-semibold' : ''
                                        }`}
                                      >
                                        {text}
                                      </TableCell>
                                    );
                                  })()}
                                  <TableCell className="sticky left-0 z-10 w-6 min-w-6 p-0 bg-card border-r border-border">
                                    <div className="flex items-center justify-center">
                                      <ChevronDown
                                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                                          isExpanded ? 'transform rotate-180' : ''
                                        }`}
                                      />
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </table>
                      </ScrollablePriceTable>
                      {product.prices.map((price) => {
                        const priceId = `${product.id}-${price.supplier_id}-${price.created_at}`;
                        if (expandedPriceId !== priceId) return null;
                        const costBeforeDiscount = Number(price.cost_price);
                        const costAfterDiscount = Number(price.cost_price_after_discount || price.cost_price);
                        const packageQty = Number(price.package_quantity) || 1;
                        const cartonPrice = costAfterDiscount * packageQty;
                        const sellPriceCarton = useMargin && price.sell_price ? Number(price.sell_price) * packageQty : 0;
                        const costPriceNet = useVat && costAfterDiscount > 0 && vatPercent > 0
                          ? grossToNet(costAfterDiscount, vatPercent / 100)
                          : costAfterDiscount;
                        const priceDate = price.created_at ? formatDate(price.created_at) : '';
                        return (
                          <div
                            key={priceId}
                            className="p-2 sm:p-4 bg-muted/30 space-y-2 sm:space-y-4 rounded-b-lg border border-t-0 border-border min-w-0 w-full"
                          >
                            {priceDate && (
                              <div className="text-left">
                                <span className="text-xs text-muted-foreground">תאריך עדכון: {priceDate}</span>
                              </div>
                            )}
                            {stockTrackingEnabled && (() => {
                              const sRow = stockRows?.find((r) => r.supplier_id === price.supplier_id);
                              const { text, isAlert } = stockRowDisplayState(sRow, decimalPrecision, {
                                enabled: stockTrackingEnabled,
                                isPending: stockQ?.isPending ?? false,
                                isFetched: stockQ?.isFetched ?? false,
                              });
                              return (
                                <div
                                  className={`rounded-lg border px-3 py-2 text-sm ${
                                    isAlert
                                      ? 'border-destructive/70 bg-destructive/10 text-destructive'
                                      : 'border-border bg-muted/40 text-foreground'
                                  }`}
                                >
                                  <span className="font-semibold">מלאי לפי ספק: </span>
                                  <span className={`tabular-nums ${isAlert ? 'font-bold' : ''}`}>{text}</span>
                                  {isAlert ? (
                                    <span className="mr-2 text-xs font-medium"> (אזל או בסף ההתראה)</span>
                                  ) : null}
                                </div>
                              );
                            })()}
                            <div className="flex flex-wrap gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-primary/10 border border-primary/20">
                              {useMargin && price.margin_percent != null && (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-primary">אחוז רווח:</span>
                                  <span className="text-sm font-bold">{Number(price.margin_percent).toFixed(1)}%</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-primary">אחוז הנחה:</span>
                                <span className="text-sm font-bold">{price.discount_percent && Number(price.discount_percent) > 0 ? `${Number(price.discount_percent).toFixed(1)}%` : '0%'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-primary">כמות באריזה:</span>
                                <span className="text-sm font-bold">{packageQty} יחידות</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-6 sm:gap-y-3">
                              <div className="flex justify-between items-center gap-2 px-3 py-2 rounded bg-card border min-w-0">
                                <span className="text-sm font-medium shrink-0">מחיר עלות</span>
                                <span className="text-sm font-bold text-foreground truncate">₪{formatUnitPrice(costAfterDiscount)}</span>
                              </div>
                              {useMargin && price.sell_price != null && (
                                <div className="flex justify-between items-center gap-2 px-3 py-2 rounded bg-card border min-w-0">
                                  <span className="text-sm font-medium flex items-center gap-1 shrink-0">מחיר מכירה <InfoTooltip content="מחיר עלות + הנחה + רווח" /></span>
                                  <span className="text-sm font-bold text-primary truncate">₪{formatUnitPrice(Number(price.sell_price))}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center gap-2 px-3 py-2 rounded bg-card border min-w-0">
                                <span className="text-sm font-medium shrink-0">מחיר לאריזה</span>
                                <span className="text-sm font-bold text-foreground truncate">₪{formatCostPrice(cartonPrice)}</span>
                              </div>
                              {useMargin && sellPriceCarton > 0 && (
                                <div className="flex justify-between items-center gap-2 px-3 py-2 rounded bg-card border min-w-0">
                                  <span className="text-sm font-medium flex items-center gap-1 shrink-0">מחיר מכירה לאריזה <InfoTooltip content="מחיר עלות + הנחה + רווח" /></span>
                                  <span className="text-sm font-bold text-primary truncate">₪{formatCostPrice(sellPriceCarton)}</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-2 pt-2 border-t border-border/50 min-w-0">
                              {useVat && (
                                <>
                                  <div className="flex justify-between items-center gap-2 text-sm text-muted-foreground min-w-0">
                                    <span className="shrink-0">מחיר לפני מע&quot;מ</span>
                                    <span className="truncate">₪{formatUnitPrice(costPriceNet)}</span>
                                  </div>
                                  <div className="flex justify-between items-center gap-2 text-sm text-muted-foreground min-w-0">
                                    <span className="shrink-0">מחיר אחרי מע&quot;מ</span>
                                    <span className="truncate">₪{formatUnitPrice(costAfterDiscount)}</span>
                                  </div>
                                </>
                              )}
                              <div className="flex justify-between items-center gap-2 text-sm text-muted-foreground min-w-0">
                                <span className="shrink-0">מחיר לפני הנחה</span>
                                <span className="truncate">₪{formatUnitPrice(costBeforeDiscount)}</span>
                              </div>
                              <div className="flex justify-between items-center gap-2 text-sm text-muted-foreground min-w-0">
                                <span className="shrink-0">מחיר לאחר הנחה</span>
                                <span className="truncate">₪{formatUnitPrice(costAfterDiscount)}</span>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2 sm:pt-4 border-t border-border/50">
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
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      אין מחירים למוצר זה
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
          <div className="flex items-center justify-center gap-4 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
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
              onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              הבא
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showInlineAddPriceDialog} onOpenChange={setShowInlineAddPriceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הוסף מחיר חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {productForInlineAdd && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="font-semibold">{productForInlineAdd.name}</div>
                <div className="text-muted-foreground">
                  {productForInlineAdd.category?.name || 'כללי'}
                  {productForInlineAdd.sku ? ` • מק"ט: ${productForInlineAdd.sku}` : ''}
                  {' • '}
                  {productForInlineAdd.unit === 'unit' ? 'יחידה' : productForInlineAdd.unit === 'kg' ? 'ק"ג' : 'ליטר'}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="inlinePriceSupplier">ספק *</Label>
              <Select
                id="inlinePriceSupplier"
                value={inlinePriceSupplierId}
                onChange={(e) => setInlinePriceSupplierId(e.target.value)}
              >
                <option value="">בחר ספק</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inlinePriceCost">מחיר עלות ליחידה *</Label>
                <Input
                  id="inlinePriceCost"
                  type="number"
                  step={priceInputStep(decimalPrecision)}
                  min="0"
                  value={inlinePriceCost}
                  onChange={(e) => handleInlineUnitPriceChange(e.target.value)}
                  placeholder={priceInputPlaceholder(decimalPrecision)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inlinePriceCarton">מחיר אריזה</Label>
                <Input
                  id="inlinePriceCarton"
                  type="number"
                  step={priceInputStep(decimalPrecision)}
                  min="0"
                  value={inlinePriceCartonPrice}
                  onChange={(e) => handleInlineCartonPriceChange(e.target.value)}
                  placeholder={priceInputPlaceholder(decimalPrecision)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {inlinePriceCartonPrice && inlinePackageQty > 0
                ? `מחיר יחידה מחושב: ${formatUnitPrice(parseInlineNumber(inlinePriceCartonPrice) / inlinePackageQty)} ₪`
                : 'אם תזין מחיר אריזה, מחיר היחידה יחושב אוטומטית'}
            </p>

            {useVat && (
              <div className="flex flex-col gap-2 text-xs mt-2 p-3 bg-muted rounded-lg">
                <Label className="text-sm font-medium">המחיר שהזנת הוא:</Label>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="inlinePriceIncludesVat"
                      className="h-3 w-3"
                      checked={inlinePriceIncludesVat === 'with'}
                      onChange={() => setInlinePriceIncludesVat('with')}
                    />
                    <span>מחיר כולל מע&quot;מ</span>
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="inlinePriceIncludesVat"
                      className="h-3 w-3"
                      checked={inlinePriceIncludesVat === 'without'}
                      onChange={() => setInlinePriceIncludesVat('without')}
                    />
                    <span>מחיר ללא מע&quot;מ</span>
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-10 gap-4">
              <div className="space-y-2 col-span-7">
                <Label htmlFor="inlinePriceQty">כמות יחידות באריזה</Label>
                <Input
                  id="inlinePriceQty"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={inlinePricePackageQuantity}
                  onChange={(e) => handleInlinePackageQtyChange(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2 col-span-3">
                <Label htmlFor="inlinePriceDiscount">אחוז הנחה</Label>
                <Input
                  id="inlinePriceDiscount"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={inlinePriceDiscount}
                  onChange={(e) => setInlinePriceDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inlinePackageType">סוג אריזה</Label>
              <Select
                id="inlinePackageType"
                value={inlinePricePackageType}
                onChange={(e) =>
                  setInlinePricePackageType(
                    e.target.value as
                      | 'carton'
                      | 'gallon'
                      | 'bag'
                      | 'bottle'
                      | 'pack'
                      | 'shrink'
                      | 'sachet'
                      | 'can'
                      | 'roll'
                      | 'unknown'
                  )
                }
              >
                <option value="unknown">לא ידוע</option>
                <option value="carton">אריזה</option>
                <option value="gallon">גלון</option>
                <option value="bag">שק</option>
                <option value="bottle">בקבוק</option>
                <option value="pack">חבילה/מארז</option>
                <option value="shrink">שרינק</option>
                <option value="sachet">שקית</option>
                <option value="can">פחית/קופסה</option>
                <option value="roll">גליל</option>
              </Select>
            </div>

            {inlineCalculatedUnitPrice > 0 && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{useVat ? 'מחיר עלות כולל מע"מ:' : 'מחיר עלות:'}</span>
                  <span className="text-lg font-bold">₪{formatUnitPrice(inlineCostAfterDiscountGross)}</span>
                </div>
                {useVat && inlineCostAfterDiscountGross > 0 && (
                  <p className="text-xs text-muted-foreground">
                    (מחיר ללא מע&quot;מ: ₪{formatCostPrice(inlineCostAfterDiscountNet)})
                  </p>
                )}
                {inlinePackageQty > 1 && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-medium">מחיר לאריזה ({formatUnitPrice(inlinePackageQty)} יחידות):</span>
                    <span className="text-lg font-bold text-primary">₪{formatCostPrice(inlineCartonTotal)}</span>
                  </div>
                )}
              </div>
            )}

            {inlinePriceError && <p className="text-xs text-red-600">{inlinePriceError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowInlineAddPriceDialog(false);
                setProductForInlineAdd(null);
              }}
            >
              ביטול
            </Button>
            <Button onClick={handleInlineAddPrice} disabled={addProductPrice.isPending || !productForInlineAdd}>
              {addProductPrice.isPending ? 'מוסיף...' : 'הוסף מחיר'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          ) : historyIsError ? (
            <div className="py-8 text-center text-sm text-destructive">
              {historyError instanceof Error ? historyError.message : 'שגיאה בטעינת היסטוריית מחירים'}
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
                    <TableHead className="whitespace-nowrap">כמות באריזה</TableHead>
                    <TableHead className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        מחיר לאריזה
                        <Tooltip content="מחיר עלות כולל מע&quot;מ × כמות באריזה" />
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
