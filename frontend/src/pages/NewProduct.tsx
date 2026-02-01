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

type Step = 'details' | 'price';

export default function NewProduct() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('details');
  
  // Product details
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [unit, setUnit] = useState<'unit' | 'kg' | 'liter'>('unit');
  const [sku, setSku] = useState('');
  const [packageQuantity, setPackageQuantity] = useState('1');
  
  // Price details
  const [supplierId, setSupplierId] = useState<string>('');
  const [costPrice, setCostPrice] = useState('');
  const [marginPercent, setMarginPercent] = useState('');
  const [vatOverride, setVatOverride] = useState('');
  const [costIncludesVat, setCostIncludesVat] = useState<'with' | 'without'>('with');
  const [discountPercent, setDiscountPercent] = useState('');

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
  const defaultMargin = selectedCategory ? Number(selectedCategory.default_margin_percent) : 0;
  const marginToUse = marginPercent ? Number(marginPercent) : defaultMargin;
  const defaultVatPercent = settings?.vat_percent ? Number(settings.vat_percent) : 18;
  const vatPercent = vatOverride !== '' ? Number(vatOverride) || 0 : defaultVatPercent;

  const parseNumber = (v: string): number => (v ? Number(v) || 0 : 0);
  const rawCost = parseNumber(costPrice);
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
    
    // If both are false, return cost as-is
    if (!useMargin && !useVat) {
      return Math.round(cost * 100) / 100;
    }
    
    // If use_margin is false, only add VAT (if enabled)
    if (!useMargin) {
      if (!useVat) {
        return Math.round(cost * 100) / 100;
      }
      const withVat = cost + (cost * vat / 100);
      return Math.round(withVat * 100) / 100;
    }
    
    // Add margin
    const withMargin = cost + (cost * margin / 100);
    
    // Add VAT only if enabled
    if (!useVat) {
      return Math.round(withMargin * 100) / 100;
    }
    
    // Normal calculation: cost + margin + VAT
    const withVat = withMargin + (withMargin * vat / 100);
    return Math.round(withVat * 100) / 100;
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
      const message = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : null;
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
      const message = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : null;
      setCategoryError(message || 'לא ניתן ליצור קטגוריה');
    }
  };

  const handleNext = () => {
    if (step === 'details') {
      if (!name.trim()) {
        alert('חובה להזין שם מוצר');
        return;
      }
      setStep('price');
    }
  };

  const handleBack = () => {
    if (step === 'price') {
      setStep('details');
    } else {
      navigate('/products');
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!supplierId || !costPrice || Number(costPrice) <= 0) {
      setProductError('חובה לבחור ספק ולהזין מחיר');
      return;
    }

    try {
      setProductError(null);
      const netCost = costBeforeVat;
      // Create product with first price (cost_price תמיד לפני מע\"מ)
      await createProduct.mutateAsync({
        name: name.trim(),
        category_id: categoryId || null,
        unit,
        supplier_id: supplierId,
        cost_price: netCost,
        margin_percent: marginToUse !== defaultMargin ? marginToUse : undefined,
      });

      navigate('/products');
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : null;
      setProductError(message || 'שגיאה ביצירת מוצר');
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <Card className="shadow-md border-2">
        <CardHeader className="border-b-2 border-border/50">
          <CardTitle className="text-2xl">הוסף מוצר חדש</CardTitle>
          <CardDescription className="text-base mt-2">
            {step === 'details' ? 'שלב 1: פרטי מוצר בסיסיים' : 'שלב 2: ספק ומחיר'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 'details' ? (
            <>
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
                      כללי (ברירת מחדל)
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
            </>
          ) : (
            <>
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
                    <Label htmlFor="costPrice">מחיר עלות מספק *</Label>
                    <Input
                      id="costPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="0.00"
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
                    <Label htmlFor="marginPercent">
                      אחוז רווח {selectedCategory && `(ברירת מחדל: ${defaultMargin}%)`}
                    </Label>
                    <Input
                      id="marginPercent"
                      type="number"
                      step="0.1"
                      min="0"
                      max="500"
                      value={marginPercent}
                      onChange={(e) => setMarginPercent(e.target.value)}
                      placeholder={defaultMargin.toString()}
                    />
                  </div>

                  {useVat && (
                    <div className="space-y-2">
                      <Label htmlFor="vatPercent">
                        מע&quot;מ (%){' '}
                        <span className="text-xs text-muted-foreground">
                          (ברירת מחדל: {defaultVatPercent}% – ניתן לעריכה לחישוב זה בלבד)
                        </span>
                      </Label>
                      <Input
                        id="vatPercent"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={vatOverride}
                        onChange={(e) => setVatOverride(e.target.value)}
                        placeholder={defaultVatPercent.toString()}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="discountPercent">אחוז הנחה מספק (אופציונלי)</Label>
                    <Input
                      id="discountPercent"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">אחוז הנחה שהספק נותן על המחיר (0-100%)</p>
                  </div>

                  {costPrice && Number(costPrice) > 0 && (
                    <div className="p-5 bg-linear-to-r from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20 shadow-sm space-y-3">
                      <div className="flex items-center gap-2">
                        <Info className="w-5 h-5 text-primary" />
                        <span className="text-base font-bold text-foreground">חישוב מחיר מכירה:</span>
                      </div>
                      <div className="text-sm space-y-2 pr-6">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">מחיר מספק (קלט):</span>
                          <span className="font-medium">{rawCost.toFixed(2)} ₪</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">מחיר עלות לפני מע&quot;מ (לחישוב):</span>
                          <span className="font-medium">{costBeforeVat.toFixed(2)} ₪</span>
                        </div>
                        {discountPercentValue > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">- הנחה ({discountPercentValue}%):</span>
                              <span className="font-medium text-green-600">-{(costBeforeVat * discountPercentValue / 100).toFixed(2)} ₪</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">מחיר לאחר הנחה:</span>
                              <span className="font-medium">{costAfterDiscount.toFixed(2)} ₪</span>
                            </div>
                          </>
                        )}
                        {useMargin && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">+ רווח ({marginToUse}%):</span>
                            <span className="font-medium">{(costAfterDiscount * marginToUse / 100).toFixed(2)} ₪</span>
                          </div>
                        )}
                        {useVat && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">+ מע&quot;מ ({vatPercent}%):</span>
                            <span className="font-medium">
                              {useMargin 
                                ? ((costAfterDiscount * (1 + marginToUse / 100) * vatPercent) / 100).toFixed(2)
                                : ((costAfterDiscount * vatPercent) / 100).toFixed(2)} ₪
                            </span>
                          </div>
                        )}
                        {useMargin || useVat ? (
                          <div className="font-bold text-lg pt-3 border-t-2 border-primary/30 flex justify-between">
                            <span>מחיר מכירה:</span>
                            <span className="text-primary">{sellPrice.toFixed(2)} ₪</span>
                          </div>
                        ) : (
                          <div className="font-bold text-lg pt-3 border-t-2 border-primary/30 flex justify-between">
                            <span>מחיר עלות:</span>
                            <span className="text-primary">{costAfterDiscount.toFixed(2)} ₪</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={handleBack}>
              <ArrowRight className="w-4 h-4 ml-2" />
              {step === 'details' ? 'ביטול' : 'חזור'}
            </Button>
            {step === 'details' ? (
              <Button onClick={handleNext} disabled={!name.trim()}>
                המשך
                <ArrowLeft className="w-4 h-4 mr-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!supplierId || !costPrice || createProduct.isPending || suppliers.length === 0}
              >
                {createProduct.isPending ? 'יוצר...' : 'צור מוצר'}
              </Button>
            )}
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
                placeholder="הערות (אופציונלי)"
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
              <Label htmlFor="newCategoryMargin">אחוז רווח ברירת מחדל (אופציונלי)</Label>
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
