import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProduct, useUpdateProduct, useAddProductPrice } from '../hooks/useProducts';
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
import { ArrowRight, ArrowLeft, Plus } from 'lucide-react';

// Helper function for calculating sell price
function calcSellPrice(costPrice: number, marginPercent: number, vatPercent: number): number {
  const base = costPrice + costPrice * (marginPercent / 100);
  const sell = base + base * (vatPercent / 100);
  return Math.round((sell + Number.EPSILON) * 100) / 100;
}

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
  const [error, setError] = useState<string | null>(null);

  // Price management state
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierNotes, setNewSupplierNotes] = useState('');
  const [newPriceSupplierId, setNewPriceSupplierId] = useState('');
  const [newPriceCost, setNewPriceCost] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name ?? '');
      setCategoryId(product.category?.id ?? '');
      setUnit((product.unit as 'unit' | 'kg' | 'liter') ?? 'unit');
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
  const globalMarginPercent = settings?.global_margin_percent ?? 30;

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
      await addProductPrice.mutateAsync({
        id,
        data: {
          supplier_id: newPriceSupplierId,
          cost_price: Number(newPriceCost),
        },
      });
      setNewPriceSupplierId('');
      setNewPriceCost('');
      setShowAddPrice(false);
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : null;
      setPriceError(message || 'שגיאה בהוספת מחיר');
    }
  };

  const currentPrices = product?.prices || [];
  const calculatedSellPrice = newPriceCost
    ? calcSellPrice(Number(newPriceCost), globalMarginPercent, vatPercent)
    : null;

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
                  {c.default_margin_percent ? `(${c.default_margin_percent}% רווח ברירת מחדל)` : ''}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ספק</TableHead>
                    <TableHead>מחיר עלות</TableHead>
                    <TableHead>מחיר מכירה</TableHead>
                    <TableHead>תאריך עדכון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentPrices.map((price: any, idx: number) => (
                    <TableRow key={`${price.supplier_id}-${idx}`}>
                      <TableCell>{price.supplier_name || 'לא ידוע'}</TableCell>
                      <TableCell>₪{Number(price.cost_price)?.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">₪{Number(price.sell_price)?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {price.created_at
                          ? new Date(price.created_at).toLocaleDateString('he-IL')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            </div>

            {calculatedSellPrice && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">מחיר מכירה משוער:</p>
                <p className="text-lg font-bold text-primary">₪{calculatedSellPrice.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  נוסחה: עלות + רווח {globalMarginPercent}% + מע&quot;מ {vatPercent}%
                </p>
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
    </div>
  );
}

