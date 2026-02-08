import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProduct } from '../hooks/useProducts';
import { useCategories, useCreateCategory } from '../hooks/useCategories';
import { useSuppliers, useCreateSupplier } from '../hooks/useSuppliers';
import { useSettings } from '../hooks/useSettings';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ArrowRight, ArrowLeft, Plus, Info } from 'lucide-react';

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

export default function NewProduct() {
  const navigate = useNavigate();
  
  // Product details
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [unit, setUnit] = useState<'unit' | 'kg' | 'liter'>('unit');
  const [sku, setSku] = useState('');
  
  // Price details
  const [supplierId, setSupplierId] = useState<string>('');
  const [costPrice, setCostPrice] = useState('');
  const [cartonPriceInput, setCartonPriceInput] = useState(''); // מחיר קרטון
  const [costIncludesVat, setCostIncludesVat] = useState<'with' | 'without'>('with');
  const [discountPercent, setDiscountPercent] = useState('');
  const [packageQuantity, setPackageQuantity] = useState('1'); // כמות בקרטון לספק

  // Inline error messages
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  
  // Add supplier dialog
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierNotes, setNewSupplierNotes] = useState('');

  // Add category dialog
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryMargin, setNewCategoryMargin] = useState('');

  const { data: categories = [] } = useCategories();
  const { data: suppliers = [], refetch: refetchSuppliers } = useSuppliers();
  const { data: settings } = useSettings();
  const createProduct = useCreateProduct();
  // const addPrice = useAddProductPrice(); // reserved for future price flows
  const createSupplier = useCreateSupplier();
  const createCategory = useCreateCategory();

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const defaultMargin = selectedCategory ? Number(selectedCategory.default_margin_percent) : (settings?.global_margin_percent ?? 0);
  const marginToUse = defaultMargin; // Use default margin from category or settings
  const defaultVatPercent = settings?.vat_percent ? Number(settings.vat_percent) : 18;
  const vatPercent = defaultVatPercent; // Use VAT from settings

  const parseNumber = (v: string): number => (v ? Number(v) || 0 : 0);
  
  // Handle carton price input - calculate unit price if carton price is entered
  const cartonPriceValue = parseNumber(cartonPriceInput);
  const packageQty = parseNumber(packageQuantity) || 1;
  
  // If carton price is entered, calculate unit price from it
  let calculatedUnitPrice = parseNumber(costPrice);
  if (cartonPriceValue > 0 && packageQty > 0) {
    calculatedUnitPrice = cartonPriceValue / packageQty;
  }
  
  const rawCost = calculatedUnitPrice;
  const costBeforeVat =
    rawCost > 0 && vatPercent > 0 && costIncludesVat === 'with'
      ? rawCost / (1 + vatPercent / 100)
      : rawCost;
  
  // Calculate cost after discount
  const discountPercentValue = parseNumber(discountPercent);
  const costAfterDiscount = discountPercentValue > 0 
    ? costBeforeVat * (1 - discountPercentValue / 100)
    : costBeforeVat;

  // Calculate sell price - check if use_margin and use_vat are enabled
  const useMargin = settings?.use_margin === true; // Default to false if not set
  const useVat = settings?.use_vat === true; // Default to false if not set
  const calculateSellPrice = (cost: number, margin: number, vat: number, useMargin: boolean, useVat: boolean) => {
    if (!cost || cost <= 0) return 0;
    
    // Don't round - keep precision up to 4 decimal places
    // If both are false, return cost as-is
    if (!useMargin && !useVat) {
      return cost;
    }
    
    // If use_margin is false, only add VAT (if enabled)
    if (!useMargin) {
      if (!useVat) {
        return cost;
      }
      return cost + (cost * vat / 100);
    }
    
    // Add margin
    const withMargin = cost + (cost * margin / 100);
    
    // Add VAT only if enabled
    if (!useVat) {
      return withMargin;
    }
    
    // Normal calculation: cost + margin + VAT
    return withMargin + (withMargin * vat / 100);
  };

  const sellPrice = calculateSellPrice(costAfterDiscount, marginToUse, vatPercent, useMargin, useVat);

  const handleAddSupplier = async (): Promise<void> => {
    if (!newSupplierName.trim()) return;
    try {
      setSupplierError(null);
      await createSupplier.mutateAsync({
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
        notes: newSupplierNotes.trim() || undefined,
      });
      await refetchSuppliers();
      setShowAddSupplier(false);
      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierNotes('');
    } catch (error) {
      console.error('Error creating supplier:', error);
      const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message) : null;
      setSupplierError(message || 'לא ניתן ליצור ספק');
    }
  };

  const handleAddCategory = async (): Promise<void> => {
    if (!newCategoryName.trim()) return;
    try {
      setCategoryError(null);
      await createCategory.mutateAsync({
        name: newCategoryName.trim(),
        default_margin_percent: newCategoryMargin ? Number(newCategoryMargin) : undefined,
      });
      setShowAddCategory(false);
      setNewCategoryName('');
      setNewCategoryMargin('');
    } catch (error) {
      console.error('Error creating category:', error);
      const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message) : null;
      setCategoryError(message || 'לא ניתן ליצור קטגוריה');
    }
  };

  // Normalize cost_price to the invariant of the system:
  // אם מע\"מ פעיל (useVat=true), cost_price תמיד נשמר כ"כולל מע\"מ" (gross).
  // אם המשתמש הזין מחיר ללא מע\"מ, נוסיף מע\"מ לפני השליחה לשרת.
  const costPriceNumber = rawCost; // כבר Number(costPrice) מהחישובים למעלה
  const costPriceToStore = useVat
    ? costIncludesVat === 'with'
      ? costPriceNumber
      : costPriceNumber * (1 + vatPercent / 100)
    : costPriceNumber;
  
  // Calculate carton price
  // If user entered carton price, use it; otherwise calculate from unit price
  const costAfterDiscountGross = discountPercentValue > 0
    ? costPriceToStore * (1 - discountPercentValue / 100)
    : costPriceToStore;
  
  // Use entered carton price if available, otherwise calculate
  const finalCartonPrice = cartonPriceValue > 0 
    ? cartonPriceValue 
    : costAfterDiscountGross * packageQty;
  

  const handleSubmit = async (): Promise<void> => {
    if (!supplierId || !costPrice || Number(costPrice) <= 0) {
      setProductError('חובה לבחור ספק ולהזין מחיר');
      return;
    }

    try {
      setProductError(null);

      // Create product with first price (cost_price נשמר ככולל מע\"מ כאשר מע\"מ פעיל)
      await createProduct.mutateAsync({
        name: name.trim(),
        category_id: categoryId || null,
        unit,
        sku: sku.trim() || null,
        supplier_id: supplierId,
        cost_price: costPriceToStore,
        // margin_percent removed - it's now only in settings/category
        discount_percent: discountPercent ? Number(discountPercent) : undefined,
        package_quantity: packageQuantity ? Number(packageQuantity) : undefined,
      });

      navigate('/products');
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message) : null;
      setProductError(message || 'שגיאה ביצירת מוצר');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <Card className="shadow-md border-2">
        <CardHeader className="border-b-2 border-border/50">
          <CardTitle className="text-2xl">הוסף מוצר חדש</CardTitle>
          <CardDescription className="text-base mt-2">
            הזן פרטי מוצר, ספק ומחיר
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
            <div className="flex gap-2 items-end">
              <Select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex-1"
              >
                <option value="">
                  כללי
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{' '}
                    {c.default_margin_percent ? `(${c.default_margin_percent}% רווח ברירת מחדל)` : ''}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddCategory(true)}
                className="whitespace-nowrap"
              >
                <Plus className="w-4 h-4 ml-1" />
                קטגוריה חדשה
              </Button>
            </div>
            {categoryError && (
              <p className="text-xs text-red-600 mt-1">{categoryError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <Label htmlFor="discountPercent">אחוז הנחה </Label>
              <Input
                id="discountPercent"
                type="number"
                step="0.0001"
                min="0"
                max="100"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">מק&quot;ט / ברקוד </Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="הזן מק&quot;ט או ברקוד"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packageQuantity">כמות יחידות בקרטון </Label>
              <Input
                id="packageQuantity"
                type="number"
                step="0.0001"
                min="0.0001"
                value={packageQuantity}
                onChange={(e) => setPackageQuantity(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          {suppliers.length === 0 && (
                <div className="p-5 bg-linear-to-r from-amber-50 to-orange-50 rounded-lg border-2 border-amber-200 shadow-sm">
                  <p className="text-sm font-medium mb-4 text-foreground">אין ספקים במערכת. הוסף ספק כדי להמשיך.</p>
                  <Button onClick={() => setShowAddSupplier(true)} size="lg" className="shadow-md">
                    <Plus className="w-4 h-4 ml-2" />
                    הוסף ספק עכשיו
                  </Button>
                </div>
              )}

              {suppliers && suppliers.length > 0 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="supplier">ספק *</Label>
                    <div className="flex gap-2">
                      <Select
                        id="supplier"
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
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
                    {supplierError && (
                      <p className="text-xs text-red-600 mt-1">{supplierError}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="costPrice">מחיר עלות ליחידה *</Label>
                    <Input
                      id="costPrice"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={costPrice}
                      onChange={(e) => {
                        setCostPrice(e.target.value);
                        // Clear carton price when unit price is manually changed
                        if (e.target.value && cartonPriceInput) {
                          setCartonPriceInput('');
                        }
                      }}
                      placeholder="0.0000"
                      required
                    />
                    {useVat && (
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="costIncludesVat"
                            className="h-3 w-3"
                            checked={costIncludesVat === 'with'}
                            onChange={() => setCostIncludesVat('with')}
                          />
                          <span>המחיר כולל מע&quot;מ</span>
                        </label>
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="costIncludesVat"
                            className="h-3 w-3"
                            checked={costIncludesVat === 'without'}
                            onChange={() => setCostIncludesVat('without')}
                          />
                          <span>המחיר ללא מע&quot;מ (המערכת תחשב ותוסיף מע&quot;מ)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cartonPriceInput">מחיר קרטון (אופציונלי)</Label>
                    <Input
                      id="cartonPriceInput"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={cartonPriceInput}
                      onChange={(e) => {
                        const newCartonPrice = e.target.value;
                        setCartonPriceInput(newCartonPrice);
                        // Calculate and update unit price when carton price is entered
                        if (newCartonPrice && packageQty > 0) {
                          const cartonPriceNum = parseNumber(newCartonPrice);
                          if (cartonPriceNum > 0) {
                            const calculatedUnitPrice = cartonPriceNum / packageQty;
                            setCostPrice(formatUnitPrice(calculatedUnitPrice));
                          }
                        } else if (!newCartonPrice && costPrice) {
                          // Clear unit price when carton price is cleared
                          setCostPrice('');
                        }
                      }}
                      placeholder="0.0000"
                    />
                    <p className="text-xs text-muted-foreground">
                      {cartonPriceInput && packageQty > 0 
                        ? `מחיר יחידה מחושב: ${formatUnitPrice(cartonPriceValue / packageQty)} ₪`
                        : 'אם תזין מחיר קרטון, מחיר היחידה יחושב אוטומטית'}
                    </p>
                  </div>

                  {((costPrice && Number(costPrice) > 0) || (cartonPriceInput && Number(cartonPriceInput) > 0)) && (
                    <div className="p-5 bg-linear-to-r from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20 shadow-sm space-y-3">
                      <div className="flex items-center gap-2">
                        <Info className="w-5 h-5 text-primary" />
                        <span className="text-base font-bold text-foreground">חישוב מחיר מכירה:</span>
                      </div>
                      <div className="text-sm space-y-2 pr-6">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">מחיר (קלט):</span>
                          <span className="font-medium">{formatCostPrice(costPriceToStore)} ₪</span>
                        </div>
                        {discountPercentValue > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">- הנחה ({formatUnitPrice(discountPercentValue)}%):</span>
                              <span className="font-medium text-green-600">-{formatCostPrice(costBeforeVat * discountPercentValue / 100)} ₪</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">מחיר לאחר הנחה:</span>
                              <span className="font-medium">{formatCostPrice(costAfterDiscount)} ₪</span>
                            </div>
                          </>
                        )}
                        {useMargin && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">+ רווח ({formatUnitPrice(marginToUse)}%):</span>
                            <span className="font-medium">{formatCostPrice(costAfterDiscount * marginToUse / 100)} ₪</span>
                          </div>
                        )}
                        {useVat && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">+ מע&quot;מ ({formatUnitPrice(vatPercent)}%):</span>
                            <span className="font-medium">
                              {formatCostPrice(useMargin 
                                ? (costAfterDiscount * (1 + marginToUse / 100) * vatPercent) / 100
                                : (costAfterDiscount * vatPercent) / 100)} ₪
                            </span>
                          </div>
                        )}
                        {useMargin || useVat ? (
                          <div className="font-bold text-lg pt-3 border-t-2 border-primary/30 flex justify-between">
                            <span>מחיר מכירה:</span>
                            <span className="text-primary">{formatUnitPrice(sellPrice)} ₪</span>
                          </div>
                        ) : (
                          <div className="font-bold text-lg pt-3 border-t-2 border-primary/30 flex justify-between">
                            <span>מחיר עלות:</span>
                            <span className="text-primary">{formatCostPrice(costAfterDiscount)} ₪</span>
                          </div>
                        )}
                        {(packageQty > 1 || cartonPriceValue > 0) && (
                          <div className="flex justify-between pt-2 border-t border-primary/20">
                            <span className="text-sm font-medium">מחיר לקרטון ({formatUnitPrice(packageQty)} יחידות):</span>
                            <span className="text-lg font-bold text-primary">₪{formatUnitPrice(finalCartonPrice)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
              </>
            )}

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => navigate('/products')}>
              <ArrowRight className="w-4 h-4 ml-2" />
              ביטול
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || !supplierId || (!costPrice && !cartonPriceInput) || createProduct.isPending || suppliers.length === 0}
            >
              {createProduct.isPending ? 'יוצר...' : 'צור מוצר'}
              <ArrowLeft className="w-4 h-4 mr-2" />
            </Button>
          </div>
          {productError && (
            <p className="text-xs text-red-600 mt-2 text-left">{productError}</p>
          )}
        </CardContent>
      </Card>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddSupplier} onOpenChange={setShowAddSupplier}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוסף ספק חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newSupplierName">שם ספק *</Label>
              <Input
                id="newSupplierName"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="הזן שם ספק"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newSupplierPhone">טלפון</Label>
              <Input
                id="newSupplierPhone"
                value={newSupplierPhone}
                onChange={(e) => setNewSupplierPhone(e.target.value)}
                placeholder="הזן טלפון"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newSupplierNotes">הערות</Label>
              <Input
                id="newSupplierNotes"
                value={newSupplierNotes}
                onChange={(e) => setNewSupplierNotes(e.target.value)}
                placeholder="הערות "
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSupplier(false)}>
              ביטול
            </Button>
            <Button
              onClick={handleAddSupplier}
              disabled={!newSupplierName.trim() || createSupplier.isPending}
            >
              {createSupplier.isPending ? 'יוצר...' : 'צור ספק'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוסף קטגוריה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newCategoryName">שם קטגוריה *</Label>
              <Input
                id="newCategoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="למשל: מזון, שתייה, שתייה מוגזת"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newCategoryMargin">אחוז רווח ברירת מחדל </Label>
              <Input
                id="newCategoryMargin"
                type="number"
                min="0"
                max="500"
                step="0.1"
                value={newCategoryMargin}
                onChange={(e) => setNewCategoryMargin(e.target.value)}
                placeholder="השאר ריק אם אין ברירת מחדל מיוחדת"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              לתתי קטגוריות (למשל שתייה → מוגז) אפשר פשוט לתת שם מפורט כמו &quot;שתייה - מוגז&quot;.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCategory(false)}>
              ביטול
            </Button>
            <Button
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim() || createCategory.isPending}
            >
              {createCategory.isPending ? 'יוצר...' : 'צור קטגוריה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
