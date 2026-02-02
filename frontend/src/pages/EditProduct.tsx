import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProduct, useUpdateProduct, useAddProductPrice, useProductPriceHistory } from '../hooks/useProducts';
import { useCategories } from '../hooks/useCategories';
import { useSuppliers, useCreateSupplier } from '../hooks/useSuppliers';
import { useSettings } from '../hooks/useSettings';
import type { Supplier } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ArrowRight, ArrowLeft, Plus, X } from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { PriceTable } from '../components/price-table/PriceTable';
import { resolveColumns, getDefaultLayout, type Settings as SettingsType } from '../lib/column-resolver';
import { loadLayout, mergeWithDefaults } from '../lib/column-layout-storage';
import { netToGross } from '../lib/pricing-rules';

export default function EditProduct() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: product, isLoading } = useProduct(id || '');
  const { data: categories = [] } = useCategories();
  const { data: suppliers = [] } = useSuppliers();
  const { data: settings } = useSettings();
  const updateProduct = useUpdateProduct();
  const addProductPrice = useAddProductPrice();
  const createSupplier = useCreateSupplier();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [unit, setUnit] = useState<'unit' | 'kg' | 'liter'>('unit');
  const [sku, setSku] = useState('');
  const [packageQuantity, setPackageQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);

  // Price management state
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [priceHistorySupplierId, setPriceHistorySupplierId] = useState<string | undefined>(undefined);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierNotes, setNewSupplierNotes] = useState('');
  const [newPriceSupplierId, setNewPriceSupplierId] = useState('');
  const [newPriceCost, setNewPriceCost] = useState('');
  const [newPriceIncludesVat, setNewPriceIncludesVat] = useState<'with' | 'without'>('without');
  const [newPriceDiscount, setNewPriceDiscount] = useState('');
  const [newPricePackageQuantity, setNewPricePackageQuantity] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  
  // Column layout management - loads from database (set in Settings page)
  const [columnLayout, setColumnLayout] = useState<ColumnLayout | null>(null);
  
  // Load layout from database on mount
  useEffect(() => {
    const loadLayoutData = async () => {
      try {
        const saved = await loadLayout();
        const layout = saved ? mergeWithDefaults(saved) : getDefaultLayout(settings || {});
        setColumnLayout(layout);
      } catch (error) {
        console.error('Failed to load column layout:', error);
        // Fallback to default
        setColumnLayout(getDefaultLayout(settings || {}));
      }
    };
    
    loadLayoutData();
  }, [settings]);
  
  // Listen for layout changes
  useEffect(() => {
    const handleLayoutChange = async () => {
      try {
        const saved = await loadLayout();
        const layout = saved ? mergeWithDefaults(saved) : getDefaultLayout(settings || {});
        setColumnLayout(layout);
      } catch (error) {
        console.error('Failed to reload column layout:', error);
      }
    };
    
    window.addEventListener('priceTableLayoutChanged', handleLayoutChange);
    return () => {
      window.removeEventListener('priceTableLayoutChanged', handleLayoutChange);
    };
  }, [settings]);
  
  // Use default layout while loading
  const effectiveLayout = columnLayout || getDefaultLayout(settings || {});

  useEffect(() => {
    if (product) {
      setName(product.name ?? '');
      setCategoryId(product.category?.id ?? '');
      setUnit((product.unit as 'unit' | 'kg' | 'liter') ?? 'unit');
      setSku((product as any).sku ?? '');
      setPackageQuantity((product as any).package_quantity?.toString() ?? '1');
    }
  }, [product]);

  const handleSave = async (): Promise<void> => {
    if (!id) return;
    if (!name.trim()) {
      setError('חובה להזין שם מוצר');
      return;
    }
    try {
      setError(null);
      await updateProduct.mutateAsync({
        id,
        data: {
          name: name.trim(),
          category_id: categoryId || null,
          unit,
          sku: sku.trim() || null,
          package_quantity: packageQuantity ? Number(packageQuantity) : undefined,
        },
      });
      navigate('/products');
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : null;
      setError(message || 'שגיאה בעדכון מוצר');
    }
  };

  const handleCancel = () => {
    navigate('/products');
  };

  const vatPercent = settings?.vat_percent ?? 18;
  const useMargin = settings?.use_margin === true;
  const useVat = settings?.use_vat === true;
  
  // Resolve columns based on settings and layout
  const appSettings: SettingsType = {
    use_vat: useVat,
    use_margin: useMargin,
    vat_percent: vatPercent,
    global_margin_percent: settings?.global_margin_percent,
  };
  
  const availableColumns = resolveColumns(appSettings, effectiveLayout);
  
  // Note: columnLayout is loaded from localStorage (managed in Settings page)
  // Changes in Settings page will be reflected after page refresh

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

  const currentPrices = product?.prices || [];
  const { data: priceHistory = [], isLoading: isLoadingHistory } = useProductPriceHistory(id || '', priceHistorySupplierId);
  const newPriceRaw = newPriceCost ? Number(newPriceCost) || 0 : 0;
  
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
  
  const packageQty = newPricePackageQuantity ? Number(newPricePackageQuantity) : 1;
  
  // For display: unit price is the net price (before VAT) if useVat is true, otherwise gross
  const unitPrice = useVat ? costPriceAfterDiscountNet : costPriceAfterDiscountGross;
  // For carton price, ALWAYS use gross price (with VAT) multiplied by package quantity
  const cartonPrice = costPriceAfterDiscountGross * packageQty;

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
      <Card className="shadow-md border-2">
        <CardHeader className="border-b-2 border-border/50">
          <CardTitle className="text-2xl">עריכת מוצר</CardTitle>
          <CardDescription className="text-base mt-2">
            עדכן שם, קטגוריה ויחידת מידה של המוצר. מחירים מנוהלים במסך הראשי.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">שם מוצר *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="הזן שם מוצר"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">קטגוריה</Label>
            <Select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">כללי (ברירת מחדל)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{' '}
                  {useMargin && c.default_margin_percent ? `(${c.default_margin_percent}% רווח ברירת מחדל)` : ''}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="sku">מק&quot;ט / ברקוד (אופציונלי)</Label>
            <Input
              id="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="הזן מק&quot;ט או ברקוד"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="packageQuantity">כמות באריזה</Label>
            <Input
              id="packageQuantity"
              type="number"
              step="0.01"
              min="0.01"
              value={packageQuantity}
              onChange={(e) => setPackageQuantity(e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground">מספר היחידות באריזה (למשל: 6 יחידות באריזה)</p>
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
        <CardHeader className="border-b-2 border-border/50">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl">ספקים ומחירים</CardTitle>
              <CardDescription className="text-base mt-2">
                ניהול ספקים ומחירים עבור מוצר זה
              </CardDescription>
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
            <div className="overflow-x-auto">
              <PriceTable
                prices={currentPrices}
                product={product}
                settings={appSettings}
                columns={availableColumns}
                renderActions={(price) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs whitespace-nowrap"
                    onClick={() => {
                      setPriceHistorySupplierId(price.supplier_id);
                      setShowPriceHistory(true);
                    }}
                  >
                    היסטוריית מחירים
                  </Button>
                )}
              />
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
                        יישמר כ-cost (gross): ₪{costPriceGross.toFixed(2)}
                      </p>
                      {newPriceIncludesVat === 'without' && (
                        <p className="text-xs text-muted-foreground">
                          נטו: ₪{newPriceRaw.toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPricePackageQuantity">כמות יחידות בקרטון (תלוי בספק) (אופציונלי)</Label>
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
              <Label htmlFor="newPriceDiscount">אחוז הנחה מספק (אופציונלי)</Label>
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
              <p className="text-xs text-muted-foreground">אחוז הנחה שהספק נותן על המחיר (0-100%)</p>
            </div>

            {newPriceRaw > 0 && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      {useVat ? 'מחיר יחידה לפני מע"מ' : 'מחיר יחידה'}:
                    </span>
                    <span className="text-lg font-bold">₪{unitPrice.toFixed(2)}</span>
                  </div>
                  {useVat && costPriceGross > 0 && (
                    <p className="text-xs text-muted-foreground">
                      (מחיר כולל מע&quot;מ: ₪{costPriceAfterDiscountGross.toFixed(2)})
                    </p>
                  )}
                  {packageQty > 1 && (
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm font-medium">מחיר לקרטון ({packageQty} יחידות):</span>
                      <span className="text-lg font-bold text-primary">₪{cartonPrice.toFixed(2)}</span>
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
              <Label htmlFor="newSupplierPhone">טלפון (אופציונלי)</Label>
              <Input
                id="newSupplierPhone"
                value={newSupplierPhone}
                onChange={(e) => setNewSupplierPhone(e.target.value)}
                placeholder="הזן מספר טלפון"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newSupplierNotes">הערות (אופציונלי)</Label>
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowPriceHistory(false)}
            >
              <X className="h-4 w-4" />
            </Button>
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
                        <TableCell className="whitespace-nowrap">{packageQty} יח\`</TableCell>
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

