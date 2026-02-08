import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useProduct, useUpdateProduct, useAddProductPrice, useUpdateProductPrice, useDeleteProductPrice, useProductPriceHistory } from '../hooks/useProducts';
import { useCategories } from '../hooks/useCategories';
import { useSuppliers, useCreateSupplier } from '../hooks/useSuppliers';
import { useSettings } from '../hooks/useSettings';
import type { Supplier, ProductPrice } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ArrowRight, ArrowLeft, Plus, X, FileText, Edit, Trash2, ChevronDown } from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import type { Settings as SettingsType } from '../lib/column-resolver';
import { netToGross } from '../lib/pricing-rules';
import { downloadTablePdf } from '../lib/pdf-service';
import { getPriceTableExportLayout, priceRowToExportValues } from '../lib/pdf-price-table';
import { useTenant } from '../hooks/useTenant';
import { grossToNet } from '../lib/pricing-rules';

// Format cost price (including VAT) - 2 decimal places
function formatCostPrice(num: number): string {
  if (isNaN(num) || num === null || num === undefined) return '0';
  return parseFloat(num.toFixed(2)).toString();
}

// Format unit price - 4 decimal places, removing trailing zeros
function formatUnitPrice(num: number): string {
  if (isNaN(num) || num === null || num === undefined) return '0';
  // Use toFixed(4) to get up to 4 decimal places, then remove trailing zeros
  return parseFloat(num.toFixed(4)).toString();
}

export default function EditProduct() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentTenant } = useTenant();
  
  // Try to use product from navigation state first (faster, no API call needed)
  const productFromState = location.state && typeof location.state === 'object' && 'product' in location.state 
    ? (location.state as { product: any }).product 
    : undefined;
  const { data: productFromApi, isLoading } = useProduct(id || '', { enabled: !productFromState });
  const product = productFromState || productFromApi;
  const { data: categories = [] } = useCategories();
  const { data: suppliers = [] } = useSuppliers();
  const { data: settings } = useSettings();
  const updateProduct = useUpdateProduct();
  const addProductPrice = useAddProductPrice();
  const updateProductPrice = useUpdateProductPrice();
  const deleteProductPrice = useDeleteProductPrice();
  const createSupplier = useCreateSupplier();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [unit, setUnit] = useState<'unit' | 'kg' | 'liter'>('unit');
  const [sku, setSku] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Price management state
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [showEditPrice, setShowEditPrice] = useState(false);
  const [showDeletePrice, setShowDeletePrice] = useState(false);
  const [priceToEdit, setPriceToEdit] = useState<{ id: string; supplier_id: string; cost_price: number; discount_percent?: number; package_quantity?: number } | null>(null);
  const [priceToDelete, setPriceToDelete] = useState<{ supplier_id: string; supplier_name: string } | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [priceHistorySupplierId, setPriceHistorySupplierId] = useState<string | undefined>(undefined);
  const [expandedPriceId, setExpandedPriceId] = useState<string | null>(null);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierNotes, setNewSupplierNotes] = useState('');
  const [newPriceSupplierId, setNewPriceSupplierId] = useState('');
  const [newPriceCost, setNewPriceCost] = useState('');
  const [newPriceCartonPrice, setNewPriceCartonPrice] = useState(''); // מחיר קרטון
  const [newPriceIncludesVat, setNewPriceIncludesVat] = useState<'with' | 'without'>('without');
  const [newPriceDiscount, setNewPriceDiscount] = useState('');
  const [newPricePackageQuantity, setNewPricePackageQuantity] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  
  const vatPercent = settings?.vat_percent ?? 18;
  const useMargin = settings?.use_margin === true;
  const useVat = settings?.use_vat === true;
  
  // Resolve columns based on settings and layout
  const appSettings: SettingsType = {
    use_vat: useVat,
    use_margin: useMargin,
    vat_percent: vatPercent,
    global_margin_percent: settings?.global_margin_percent ?? undefined,
  };
  
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
  

  useEffect(() => {
    if (product) {
      setName(product.name ?? '');
      setCategoryId(product.category?.id ?? '');
      setUnit((product.unit as 'unit' | 'kg' | 'liter') ?? 'unit');
      setSku((product as any).sku ?? '');
      // package_quantity removed - it's now only in price_entries (supplier-specific)
    }
  }, [product]);

  const handleSave = (): void => {
    if (!id) return;
    if (!name.trim()) {
      setError('חובה להזין שם מוצר');
      return;
    }
    
    // Clear any previous errors
    setError(null);
    
    // Start the mutation with optimistic update (handled in useUpdateProduct hook)
    // Navigate immediately - the mutation will update the cache optimistically
    updateProduct.mutate(
      {
        id,
        data: {
          name: name.trim(),
          category_id: categoryId || null,
          unit,
          sku: sku.trim() || null,
          // package_quantity removed - it's now only in price_entries (supplier-specific)
        },
      },
      {
        onSuccess: () => {
          // Navigation happens immediately, but this ensures we're on the right page
          navigate('/products');
        },
        onError: (e) => {
          // Show error message but don't block - rollback is automatic
          const message = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : null;
          setError(message || 'העדכון לא הצליח. אנא נסה שוב.');
        },
      }
    );
    
    // Navigate immediately (optimistic navigation)
    navigate('/products');
  };

  const handleCancel = () => {
    navigate('/products');
  };
  
  // Changes in Settings page will be reflected after page refresh
  // availableColumns removed - using Accordion instead of PriceTable

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) {
      setSupplierError('חובה להזין שם ספק');
      return;
    }
    try {
      setSupplierError(null);
      const newSupplier: Supplier = await createSupplier.mutateAsync({
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
        notes: newSupplierNotes.trim() || undefined,
      });
      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierNotes('');
      setNewPriceSupplierId(newSupplier.id);
      setShowAddSupplier(false);
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : null;
      setSupplierError(message || 'שגיאה ביצירת ספק');
    }
  };

  const handleAddPrice = async () => {
    if (!id) return;
    if (!newPriceSupplierId) {
      setPriceError('חובה לבחור ספק');
      return;
    }
    if (!newPriceCost || Number(newPriceCost) <= 0) {
      setPriceError('חובה להזין מחיר עלות תקין');
      return;
    }
    try {
      setPriceError(null);
      const rawCost = Number(newPriceCost);
      // cost_price is ALWAYS stored as gross (with VAT if VAT enabled)
      // If user selected "without VAT", convert net to gross
      const costPriceToStore = useVat && rawCost > 0 && newPriceIncludesVat === 'without'
          ? netToGross(rawCost, vatPercent / 100)
          : rawCost;
      await addProductPrice.mutateAsync({
        id,
        data: {
          supplier_id: newPriceSupplierId,
          cost_price: costPriceToStore,
          discount_percent: newPriceDiscount ? Number(newPriceDiscount) : undefined,
          package_quantity: newPricePackageQuantity ? Number(newPricePackageQuantity) : undefined,
        } as any,
      });
      setNewPriceSupplierId('');
      setNewPriceCost('');
      setNewPriceIncludesVat('without');
      setNewPriceDiscount('');
      setNewPricePackageQuantity('');
      setShowAddPrice(false);
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : null;
      setPriceError(message || 'שגיאה בהוספת מחיר');
    }
  };

  const handleEditPrice = (price: any) => {
    if (!id) return;
    // Always show gross price (cost_price is always stored as gross if VAT enabled)
    const costPriceGross = price.cost_price;
    const packageQty = Number(price.package_quantity) || 1;
    const cartonPrice = costPriceGross * packageQty;
    
    setPriceToEdit({
      id: price.id,
      supplier_id: price.supplier_id,
      cost_price: costPriceGross, // Show gross price in form
      discount_percent: price.discount_percent || 0,
      package_quantity: price.package_quantity || undefined,
    });
    setNewPriceSupplierId(price.supplier_id);
    setNewPriceCost(formatUnitPrice(costPriceGross));
    setNewPriceCartonPrice(formatCostPrice(cartonPrice)); // Calculate and set carton price
    setNewPriceIncludesVat('with'); // Always show as gross (including VAT) in edit form
    setNewPriceDiscount(price.discount_percent ? price.discount_percent.toString() : '');
    setNewPricePackageQuantity(price.package_quantity ? price.package_quantity.toString() : '');
    setPriceError(null);
    setShowEditPrice(true);
  };

  const handleUpdatePrice = async () => {
    if (!id || !priceToEdit) return;
    if (!newPriceSupplierId) {
      setPriceError('חובה לבחור ספק');
      return;
    }
    
    // Use calculated unit price (from carton price if entered, otherwise from direct input)
    const parseNumber = (v: string): number => (v ? Number(v) || 0 : 0);
    const cartonPriceValue = parseNumber(newPriceCartonPrice);
    const packageQty = parseNumber(newPricePackageQuantity) || 1;
    const finalUnitPrice = cartonPriceValue > 0 && packageQty > 0
      ? cartonPriceValue / packageQty
      : parseNumber(newPriceCost);
    
    if (!finalUnitPrice || finalUnitPrice <= 0) {
      setPriceError('חובה להזין מחיר עלות תקין או מחיר קרטון');
      return;
    }
    
    try {
      setPriceError(null);
      // cost_price is ALWAYS stored as gross (with VAT if VAT enabled)
      // If user selected "without VAT", convert net to gross
      const costPriceToStore = useVat && finalUnitPrice > 0 && newPriceIncludesVat === 'without'
          ? netToGross(finalUnitPrice, vatPercent / 100)
          : finalUnitPrice;
      await updateProductPrice.mutateAsync({
        id,
        priceId: priceToEdit.id,
        data: {
          supplier_id: newPriceSupplierId,
          cost_price: costPriceToStore,
          discount_percent: newPriceDiscount ? Number(newPriceDiscount) : undefined,
          package_quantity: newPricePackageQuantity ? Number(newPricePackageQuantity) : undefined,
        } as any,
      });
      setPriceToEdit(null);
      setNewPriceSupplierId('');
      setNewPriceCost('');
      setNewPriceCartonPrice('');
      setNewPriceIncludesVat('without');
      setNewPriceDiscount('');
      setNewPricePackageQuantity('');
      setShowEditPrice(false);
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : null;
      setPriceError(message || 'שגיאה בעדכון מחיר');
    }
  };

  const handleDeletePrice = async () => {
    if (!id || !priceToDelete) return;
    try {
      await deleteProductPrice.mutateAsync({
        id,
        supplierId: priceToDelete.supplier_id,
      });
      setPriceToDelete(null);
      setShowDeletePrice(false);
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : null;
      setPriceError(message || 'שגיאה במחיקת מחירים');
    }
  };

  const currentPrices = product?.prices || [];
  const { data: priceHistory = [], isLoading: isLoadingHistory } = useProductPriceHistory(id || '', priceHistorySupplierId);
  
  // Parse inputs
  const parseNumber = (v: string): number => (v ? Number(v) || 0 : 0);
  const cartonPriceValue = parseNumber(newPriceCartonPrice);
  const packageQty = parseNumber(newPricePackageQuantity) || 1;
  
  // If carton price is entered, calculate unit price from it
  let calculatedUnitPrice = parseNumber(newPriceCost);
  if (cartonPriceValue > 0 && packageQty > 0) {
    // If carton price is entered, use it to calculate unit price (prefer carton price)
    calculatedUnitPrice = cartonPriceValue / packageQty;
  }
  
  const newPriceRaw = calculatedUnitPrice;
  
  // Calculate cost_price_gross (always stored with VAT if use_vat = true)
  // If user selected "with VAT", the price is already gross
  // If user selected "without VAT", we need to add VAT to get gross
  const costPriceGross = useVat && newPriceRaw > 0 && vatPercent > 0 && newPriceIncludesVat === 'without'
      ? newPriceRaw * (1 + vatPercent / 100)
      : newPriceRaw;
  
  // Calculate cost_price_after_discount (gross, with VAT)
  const newPriceDiscountValue = newPriceDiscount ? Number(newPriceDiscount) || 0 : 0;
  const costPriceAfterDiscountGross = costPriceGross > 0 && newPriceDiscountValue > 0
    ? costPriceGross * (1 - newPriceDiscountValue / 100)
    : costPriceGross;
  
  // Calculate cost_price_after_discount (net, before VAT) - derived at runtime
  const costPriceAfterDiscountNet = useVat && costPriceAfterDiscountGross > 0 && vatPercent > 0
      ? costPriceAfterDiscountGross / (1 + vatPercent / 100)
      : costPriceAfterDiscountGross;
  
  // For display: unit price is ALWAYS gross (with VAT) - this is what the user entered
  const unitPrice = costPriceAfterDiscountGross;
  // For carton price, ALWAYS use gross price (with VAT) multiplied by package quantity
  const cartonPrice = costPriceAfterDiscountGross * packageQty;
  
  // Auto-calculate unit price when carton price is entered
  useEffect(() => {
    if (cartonPriceValue > 0 && packageQty > 0) {
      const calculated = cartonPriceValue / packageQty;
      setNewPriceCost(formatUnitPrice(calculated));
    }
  }, [cartonPriceValue, packageQty]);

  if (!id) {
    return null;
  }

  if (isLoading || !product) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <Card className="shadow-md border-2">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            טוען פרטי מוצר...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-4">
        <Button
          variant="outline"
          onClick={() => navigate('/products')}
          className="flex items-center gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          חזור לכל המוצרים
        </Button>
      </div>
      <Card className="shadow-md border-2">
        <CardHeader className="border-border/50">
          <CardTitle className="text-2xl">עריכת מוצר</CardTitle>
          {/* <CardDescription className="text-base mt-2">
            עדכן שם, קטגוריה ויחידת מידה של המוצר. מחירים מנוהלים במסך הראשי.
          </CardDescription> */}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-10 gap-4">
            <div className="space-y-2 col-span-7">
              <Label htmlFor="name">שם מוצר *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="הזן שם מוצר"
                required
              />
            </div>

            <div className="space-y-2 col-span-3">
              <Label htmlFor="unit">יחידת מידה</Label>
              <Select
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'unit' | 'kg' | 'liter')}
              >
                <option value="unit">יחידה</option>
                <option value="kg">ק"ג</option>
                <option value="liter">ליטר</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">מק&quot;ט / ברקוד</Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="הזן מק&quot;ט או ברקוד"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">קטגוריה</Label>
              <Select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">כללי</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{' '}
                    {useMargin && c.default_margin_percent ? `(${c.default_margin_percent}% רווח ברירת מחדל)` : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>


          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" onClick={handleCancel}>
              <ArrowRight className="w-4 h-4 ml-2" />
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={updateProduct.isPending}>
              {updateProduct.isPending ? 'שומר...' : 'שמור שינויים'}
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers and Prices Section */}
      <Card className="shadow-md border-2 mt-6">
        <CardHeader className=" border-border/50">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl">ספקים ומחירים</CardTitle>
              {/* <CardDescription className="text-base mt-2">
                ניהול ספקים ומחירים עבור מוצר זה
              </CardDescription> */}
            </div>
            <Button onClick={() => setShowAddPrice(true)}>
              <Plus className="w-4 h-4 ml-2" />
              הוסף מחיר חדש
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {currentPrices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין מחירים עבור מוצר זה. הוסף מחיר חדש כדי להתחיל.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border">
                      <TableHead className="font-semibold">ספק</TableHead>
                      <TableHead className="font-semibold">מחיר עלות</TableHead>
                      <TableHead className="font-semibold">פעולות</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentPrices.map((price: ProductPrice) => {
                      const supplier = suppliers.find(s => s.id === price.supplier_id);
                      const priceId = price.id || `${price.supplier_id}-${price.created_at}`;
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
                      
                      // Prepare fields for accordion content (with labels) - including carton price
                      const fields = [
                        { label: 'מחיר לקרטון', value: `₪${formatCostPrice(cartonPrice)}`, highlight: true },
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
                          <TableRow className="border-b border-border">
                            <TableCell className="font-semibold">{supplier?.name || 'לא ידוע'}</TableCell>
                            <TableCell>₪{formatUnitPrice(Number(price.cost_price))}</TableCell>
                            <TableCell>
                              <div className="flex flex-col items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditPrice(price);
                                  }}
                                  className="h-8 w-full"
                                >
                                  <Edit className="w-4 h-4 ml-1" />
                                  ערוך
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPriceToDelete({ supplier_id: price.supplier_id, supplier_name: supplier?.name || 'לא ידוע' });
                                    setShowDeletePrice(true);
                                  }}
                                  className="h-8 w-full"
                                >
                                  <Trash2 className="w-4 h-4 ml-1" />
                                  מחק
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div
                                className="cursor-pointer hover:bg-muted/50 active:bg-muted touch-manipulation p-1 rounded"
                                onClick={() => setExpandedPriceId(isExpanded ? null : priceId)}
                              >
                                <ChevronDown
                                  className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                                    isExpanded ? 'transform rotate-180' : ''
                                  }`}
                                />
                              </div>
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
                                        setPriceHistorySupplierId(price.supplier_id);
                                        setShowPriceHistory(true);
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
          )}
        </CardContent>
      </Card>

      {/* Add Price Dialog */}
      <Dialog open={showAddPrice} onOpenChange={setShowAddPrice}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הוסף מחיר חדש</DialogTitle>
            <DialogDescription>הוסף מחיר חדש לספק עבור מוצר זה</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPriceSupplier">ספק *</Label>
              <div className="flex gap-2">
                <Select
                  id="newPriceSupplier"
                  value={newPriceSupplierId}
                  onChange={(e) => setNewPriceSupplierId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">בחר ספק</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddSupplier(true)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPriceCost">מחיר עלות *</Label>
              <Input
                id="newPriceCost"
                type="number"
                step="0.01"
                min="0"
                value={newPriceCost}
                onChange={(e) => setNewPriceCost(e.target.value)}
                placeholder="0.00"
              />
              {useVat && (
                <div className="flex flex-col gap-2 text-xs mt-2 p-3 bg-muted rounded-lg">
                  <Label className="text-sm font-medium">המחיר שהזנת הוא:</Label>
                  <div className="flex gap-4">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="newPriceIncludesVat"
                        className="h-3 w-3"
                        checked={newPriceIncludesVat === 'with'}
                        onChange={() => setNewPriceIncludesVat('with')}
                      />
                      <span>גרוס (כולל מע&quot;מ)</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="newPriceIncludesVat"
                        className="h-3 w-3"
                        checked={newPriceIncludesVat === 'without'}
                        onChange={() => setNewPriceIncludesVat('without')}
                      />
                      <span>נטו (ללא מע&quot;מ) - המערכת תמיר לגרוס</span>
                    </label>
                  </div>
                  {newPriceRaw > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground">
                        יישמר כ-cost (gross): ₪{formatUnitPrice(costPriceGross)}
                      </p>
                      {newPriceIncludesVat === 'without' && (
                        <p className="text-xs text-muted-foreground">
                          נטו: ₪{formatUnitPrice(newPriceRaw)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPricePackageQuantity">כמות יחידות בקרטון</Label>
              <Input
                id="newPricePackageQuantity"
                type="number"
                step="0.01"
                min="0.01"
                value={newPricePackageQuantity}
                onChange={(e) => setNewPricePackageQuantity(e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">מספר היחידות בקרטון עבור ספק זה (למשל: 12, 24, 48)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPriceDiscount">אחוז הנחה</Label>
              <Input
                id="newPriceDiscount"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={newPriceDiscount}
                onChange={(e) => setNewPriceDiscount(e.target.value)}
                placeholder="0"
              />
            </div>

            {newPriceRaw > 0 && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      {useVat ? 'מחיר יחידה כולל מע"מ' : 'מחיר יחידה'}:
                    </span>
                    <span className="text-lg font-bold">₪{formatUnitPrice(unitPrice)}</span>
                  </div>
                  {useVat && costPriceAfterDiscountGross > 0 && (
                    <p className="text-xs text-muted-foreground">
                      (מחיר ללא מע&quot;מ: ₪{formatCostPrice(costPriceAfterDiscountNet)})
                    </p>
                  )}
                  {packageQty > 1 && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm font-medium">מחיר לקרטון ({formatUnitPrice(packageQty)} יחידות):</span>
                      <span className="text-lg font-bold text-primary">₪{formatCostPrice(cartonPrice)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {priceError && <p className="text-xs text-red-600">{priceError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddPrice(false)}>
                ביטול
              </Button>
              <Button onClick={handleAddPrice} disabled={addProductPrice.isPending}>
                {addProductPrice.isPending ? 'מוסיף...' : 'הוסף מחיר'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddSupplier} onOpenChange={setShowAddSupplier}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הוסף ספק חדש</DialogTitle>
            <DialogDescription>הוסף ספק חדש למערכת</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newSupplierName">שם ספק *</Label>
              <Input
                id="newSupplierName"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="הזן שם ספק"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newSupplierPhone">טלפון</Label>
              <Input
                id="newSupplierPhone"
                value={newSupplierPhone}
                onChange={(e) => setNewSupplierPhone(e.target.value)}
                placeholder="הזן מספר טלפון"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newSupplierNotes">הערות </Label>
              <Input
                id="newSupplierNotes"
                value={newSupplierNotes}
                onChange={(e) => setNewSupplierNotes(e.target.value)}
                placeholder="הזן הערות"
              />
            </div>

            {supplierError && <p className="text-xs text-red-600">{supplierError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddSupplier(false)}>
                ביטול
              </Button>
              <Button onClick={handleAddSupplier} disabled={createSupplier.isPending}>
                {createSupplier.isPending ? 'יוצר...' : 'הוסף ספק'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Price Dialog */}
      <Dialog open={showEditPrice} onOpenChange={setShowEditPrice}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ערוך מחיר</DialogTitle>
            <DialogDescription>עדכן מחיר לספק עבור מוצר זה</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editPriceSupplier">ספק *</Label>
              <div className="flex gap-2">
                <Select
                  id="editPriceSupplier"
                  value={newPriceSupplierId}
                  onChange={(e) => setNewPriceSupplierId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">בחר ספק</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddSupplier(true)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editPriceCost">מחיר עלות ליחידה *</Label>
                <Input
                  id="editPriceCost"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={newPriceCost}
                  onChange={(e) => {
                    const newUnitPrice = e.target.value;
                    setNewPriceCost(newUnitPrice);
                    // Calculate carton price when unit price is entered
                    if (newUnitPrice && packageQty > 0) {
                      const unitPriceNum = parseNumber(newUnitPrice);
                      if (unitPriceNum > 0) {
                        const calculatedCartonPrice = unitPriceNum * packageQty;
                        setNewPriceCartonPrice(formatUnitPrice(calculatedCartonPrice));
                      }
                    } else if (!newUnitPrice) {
                      setNewPriceCartonPrice('');
                    }
                  }}
                  placeholder="0.0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPriceCartonPrice">מחיר קרטון</Label>
                <Input
                  id="editPriceCartonPrice"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={newPriceCartonPrice}
                  onChange={(e) => {
                    const newCartonPrice = e.target.value;
                    setNewPriceCartonPrice(newCartonPrice);
                    // Calculate and update unit price when carton price is entered
                    if (newCartonPrice && packageQty > 0) {
                      const cartonPriceNum = parseNumber(newCartonPrice);
                      if (cartonPriceNum > 0) {
                        const calculatedUnitPrice = cartonPriceNum / packageQty;
                        setNewPriceCost(formatUnitPrice(calculatedUnitPrice));
                      }
                    } else if (!newCartonPrice && newPriceCost) {
                      // Don't clear unit price when carton price is cleared
                    }
                  }}
                  placeholder="0.0000"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {newPriceCartonPrice && packageQty > 0
                ? `מחיר יחידה מחושב: ${formatUnitPrice(parseNumber(newPriceCartonPrice) / packageQty)} ₪`
                : 'אם תזין מחיר קרטון, מחיר היחידה יחושב אוטומטית'}
            </p>
            {useVat && (
                <div className="flex flex-col gap-2 text-xs mt-2 p-3 bg-muted rounded-lg">
                  <Label className="text-sm font-medium">המחיר שהזנת הוא:</Label>
                  <div className="flex gap-4">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="editPriceIncludesVat"
                        className="h-3 w-3"
                        checked={newPriceIncludesVat === 'with'}
                        onChange={() => setNewPriceIncludesVat('with')}
                      />
                      <span>גרוס (כולל מע&quot;מ)</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="editPriceIncludesVat"
                        className="h-3 w-3"
                        checked={newPriceIncludesVat === 'without'}
                        onChange={() => setNewPriceIncludesVat('without')}
                      />
                      <span>נטו (ללא מע&quot;מ) - המערכת תמיר לגרוס</span>
                    </label>
                  </div>
                  {newPriceRaw > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground">
                        יישמר כ-cost (gross): ₪{formatUnitPrice(costPriceGross)}
                      </p>
                      {newPriceIncludesVat === 'without' && (
                        <p className="text-xs text-muted-foreground">
                          נטו: ₪{formatUnitPrice(newPriceRaw)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

            <div className="grid grid-cols-10 gap-4">
              <div className="space-y-2 col-span-7">
                <Label htmlFor="editPricePackageQuantity">כמות יחידות בקרטון</Label>
                <Input
                  id="editPricePackageQuantity"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newPricePackageQuantity}
                  onChange={(e) => {
                    const newQty = e.target.value;
                    setNewPricePackageQuantity(newQty);
                    const qtyNum = parseNumber(newQty);
                    // Recalculate unit price if carton price is set
                    if (newPriceCartonPrice && qtyNum > 0) {
                      const cartonPriceNum = parseNumber(newPriceCartonPrice);
                      if (cartonPriceNum > 0) {
                        const calculatedUnitPrice = cartonPriceNum / qtyNum;
                        setNewPriceCost(formatUnitPrice(calculatedUnitPrice));
                      }
                    }
                    // Recalculate carton price if unit price is set
                    else if (newPriceCost && qtyNum > 0) {
                      const unitPriceNum = parseNumber(newPriceCost);
                      if (unitPriceNum > 0) {
                        const calculatedCartonPrice = unitPriceNum * qtyNum;
                        setNewPriceCartonPrice(formatUnitPrice(calculatedCartonPrice));
                      }
                    }
                  }}
                  placeholder="1"
                />
              </div>

              <div className="space-y-2 col-span-3">
                <Label htmlFor="editPriceDiscount">אחוז הנחה</Label>
                <Input
                  id="editPriceDiscount"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={newPriceDiscount}
                  onChange={(e) => setNewPriceDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">אחוז הנחה שהספק נותן על המחיר (0-100%)</p>

            {newPriceRaw > 0 && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      {useVat ? 'מחיר יחידה כולל מע"מ' : 'מחיר יחידה'}:
                    </span>
                    <span className="text-lg font-bold">₪{formatUnitPrice(unitPrice)}</span>
                  </div>
                  {useVat && costPriceAfterDiscountGross > 0 && (
                    <p className="text-xs text-muted-foreground">
                      (מחיר ללא מע&quot;מ: ₪{formatCostPrice(costPriceAfterDiscountNet)})
                    </p>
                  )}
                  {packageQty > 1 && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm font-medium">מחיר לקרטון ({formatUnitPrice(packageQty)} יחידות):</span>
                      <span className="text-lg font-bold text-primary">₪{formatCostPrice(cartonPrice)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {priceError && <p className="text-xs text-red-600">{priceError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowEditPrice(false)}>
                ביטול
              </Button>
              <Button onClick={handleUpdatePrice} disabled={updateProductPrice.isPending}>
                {updateProductPrice.isPending ? 'מעדכן...' : 'עדכן מחיר'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Price Dialog */}
      <Dialog open={showDeletePrice} onOpenChange={setShowDeletePrice}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>מחיקת ספק מהמוצר</DialogTitle>
            <DialogDescription>
              <div className="space-y-2">
                <p>
                  האם אתה בטוח שברצונך למחוק את <strong>כל המחירים</strong> של הספק "{priceToDelete?.supplier_name}" עבור מוצר זה?
                </p>
                <p className="text-sm text-muted-foreground">
                  פעולה זו תמחק את כל היסטוריית המחירים של הספק הזה למוצר זה, כולל כל הרשומות הקודמות.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeletePrice(false)}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePrice}
              disabled={deleteProductPrice.isPending}
            >
              {deleteProductPrice.isPending ? 'מוחק...' : 'מחק את כל המחירים'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={showPriceHistory} onOpenChange={setShowPriceHistory}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <DialogHeader className="flex-1">
              <DialogTitle>היסטוריית מחירים</DialogTitle>
              <DialogDescription>
                {priceHistorySupplierId 
                  ? `היסטוריית מחירים עבור ספק: ${suppliers.find(s => s.id === priceHistorySupplierId)?.name || 'לא ידוע'}`
                  : 'כל היסטוריית המחירים למוצר זה'}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              {id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const { columns } = await getPriceTableExportLayout(appSettings, 'priceHistoryTable');
                      
                      // Add SKU column if product has SKU
                      const exportColumns = product?.sku
                        ? [
                            ...columns,
                            { key: 'sku', label: 'מק״ט' },
                          ]
                        : columns;
                      
                      const columnKeys = exportColumns.map((c) => c.key);
                      const rowObjects = (priceHistory || []).map((price: any) =>
                        priceRowToExportValues({
                          price,
                          product: product || {},
                          settings: appSettings,
                          columnKeys,
                        })
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
                      console.error('Error printing:', error);
                      alert('שגיאה בייצוא PDF');
                    }
                  }}
                >
                  <FileText className="w-4 h-4 ml-2" />
                  ייצא PDF
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowPriceHistory(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {isLoadingHistory ? (
            <div className="text-center py-8">טוען...</div>
          ) : priceHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">אין היסטוריית מחירים</div>
          ) : (
            <div className="mt-4">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap min-w-[120px]">תאריך</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[120px]">ספק</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[100px]">
                      <div>מחיר עלות</div>
                      {useVat && <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(כולל מע&quot;מ)</div>}
                    </TableHead>
                    {useVat && (
                      <TableHead className="whitespace-nowrap min-w-[120px]">
                        <div>מחיר לפני מע&quot;מ</div>
                      </TableHead>
                    )}
                    <TableHead className="whitespace-nowrap min-w-[80px]">הנחה</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[120px]">
                      <div>מחיר לאחר הנחה</div>
                      {useVat && <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(כולל מע&quot;מ)</div>}
                    </TableHead>
                    {useVat && (
                      <TableHead className="whitespace-nowrap min-w-[120px]">
                        <div>מחיר לאחר הנחה</div>
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5">(לפני מע&quot;מ)</div>
                      </TableHead>
                    )}
                    <TableHead className="whitespace-nowrap min-w-[100px]">כמות בקרטון</TableHead>
                    <TableHead className="whitespace-nowrap min-w-[140px]">
                      <div className="flex items-center gap-1">
                        מחיר לקרטון
                        <Tooltip content="מחיר עלות כולל מע&quot;מ × כמות בקרטון" />
                      </div>
                    </TableHead>
                    {useMargin && (
                      <TableHead className="whitespace-nowrap min-w-[100px]">
                        <div className="flex items-center gap-1">
                          מחיר מכירה
                          <Tooltip content="מחיר עלות + מע&quot;מ + רווח" />
                        </div>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistory.map((price: any) => {
                    const supplierName = suppliers.find(s => s.id === price.supplier_id)?.name || price.supplier_name || 'לא ידוע';
                    // cost_price is ALWAYS stored with VAT (if use_vat is true) or as-is (if use_vat is false)
                    const costPriceWithVat = Number(price.cost_price);
                    // Calculate price before VAT if useVat is true
                    const costPriceBeforeVat = useVat && vatPercent > 0
                      ? costPriceWithVat / (1 + vatPercent / 100)
                      : costPriceWithVat;
                    
                    // cost_price_after_discount is also stored with VAT (if use_vat is true)
                    const costAfterDiscountWithVat = Number(price.cost_price_after_discount || price.cost_price);
                    const costAfterDiscountBeforeVat = useVat && vatPercent > 0
                      ? costAfterDiscountWithVat / (1 + vatPercent / 100)
                      : costAfterDiscountWithVat;
                    
                    // For carton price, ALWAYS use gross price (with VAT) multiplied by package quantity
                    const unitPriceForCarton = costAfterDiscountWithVat;
                    
                    const pricePackageQty = price.package_quantity;
                    const productPackageQty = product?.package_quantity;
                    let packageQty = 1;
                    // First check if price has package_quantity (supplier-specific)
                    if (pricePackageQty !== null && pricePackageQty !== undefined && !isNaN(Number(pricePackageQty)) && Number(pricePackageQty) > 0) {
                      packageQty = Number(pricePackageQty);
                    } 
                    // Fallback to product package_quantity if price doesn't have it
                    else if (productPackageQty !== null && productPackageQty !== undefined && !isNaN(Number(productPackageQty)) && Number(productPackageQty) > 0) {
                      packageQty = Number(productPackageQty);
                    }
                    // If no package_quantity, packageQty stays 1 (unit price = carton price)
                    const cartonPrice = unitPriceForCarton * packageQty;
                    return (
                      <TableRow key={price.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(price.created_at).toLocaleDateString('he-IL', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{supplierName}</TableCell>
                        <TableCell className="whitespace-nowrap">₪{costPriceWithVat.toFixed(2)}</TableCell>
                        {useVat && <TableCell className="whitespace-nowrap">₪{costPriceBeforeVat.toFixed(2)}</TableCell>}
                        <TableCell className="whitespace-nowrap">
                          {price.discount_percent && Number(price.discount_percent) > 0 
                            ? `${Number(price.discount_percent).toFixed(1)}%`
                            : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">₪{costAfterDiscountWithVat.toFixed(2)}</TableCell>
                        {useVat && <TableCell className="whitespace-nowrap">₪{costAfterDiscountBeforeVat.toFixed(2)}</TableCell>}
                        <TableCell className="whitespace-nowrap">{packageQty} יח`</TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">
                          ₪{cartonPrice.toFixed(2)}
                        </TableCell>
                        {useMargin && <TableCell className="whitespace-nowrap">₪{Number(price.sell_price).toFixed(2)}</TableCell>}
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

