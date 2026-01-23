import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts, useDeleteProduct, useProductPriceHistory } from '../hooks/useProducts';
import { useSuppliers } from '../hooks/useSuppliers';
import { useCategories } from '../hooks/useCategories';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Search, Edit, Trash2, DollarSign, Calendar } from 'lucide-react';

type SortOption = 'price_asc' | 'price_desc' | 'updated_desc' | 'updated_asc';

export default function Products() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [sort, setSort] = useState<SortOption>('updated_desc');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [historySupplierId, setHistorySupplierId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: products, isLoading } = useProducts({
    search: search || undefined,
    supplier_id: supplierFilter || undefined,
    category_id: categoryFilter || undefined,
    sort,
  });

  const { data: suppliers } = useSuppliers();
  const { data: categories } = useCategories();
  const { data: priceHistory, isLoading: historyLoading } = useProductPriceHistory(
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
    if (!date) return 'לא עודכן';
    return new Date(date).toLocaleDateString('he-IL');
  };

  const closeHistory = () => {
    setHistoryOpen(false);
    setHistoryProductId(null);
    setHistorySupplierId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">מוצרים</h1>
          <p className="text-sm text-muted-foreground mt-1.5">נהל את כל המוצרים והמחירים שלך</p>
        </div>
        <Button onClick={() => navigate('/products/new')} size="lg" className="shadow-md hover:shadow-lg">
          <Plus className="w-4 h-4 ml-2" />
          הוסף מוצר
        </Button>
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
                  placeholder="חיפוש לפי שם מוצר..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">ספק</Label>
              <Select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
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
                onChange={(e) => setCategoryFilter(e.target.value)}
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
                onChange={(e) => setSort(e.target.value as SortOption)}
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
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md border border-border/50">
                        {product.category?.name || 'ללא קטגוריה'}
                      </span>
                      <span>•</span>
                      <span className="px-2 py-1 bg-muted rounded-md border border-border/50">{product.unit === 'unit' ? 'יחידה' : product.unit === 'kg' ? 'ק"ג' : 'ליטר'}</span>
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
                        <Table>
                          <TableHeader>
                              <TableRow className="bg-linear-to-r from-muted to-muted/50 border-b-2">
                              <TableHead className="font-semibold">ספק</TableHead>
                              <TableHead className="font-semibold">מחיר עלות</TableHead>
                              <TableHead className="font-semibold">אחוז רווח</TableHead>
                              <TableHead className="font-semibold">מחיר מכירה</TableHead>
                              <TableHead className="font-semibold">תאריך</TableHead>
                              <TableHead className="font-semibold">פעולות</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {product.prices.map((price, idx: number) => (
                              <TableRow key={`${price.supplier_id}-${idx}`} className="hover:bg-muted/20">
                                <TableCell>{price.supplier_name || 'לא ידוע'}</TableCell>
                                <TableCell>{formatPrice(Number(price.cost_price))}</TableCell>
                                <TableCell>{Number(price.margin_percent).toFixed(1)}%</TableCell>
                                <TableCell className="font-bold text-primary">{formatPrice(Number(price.sell_price))}</TableCell>
                                <TableCell>{formatDate(price.created_at)}</TableCell>
                                <TableCell>
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
                                </TableCell>
                              </TableRow>
                            ))}
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
          <DialogHeader>
            <DialogTitle>היסטוריית מחירים</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              טוען היסטוריית מחירים...
            </div>
          ) : !priceHistory || priceHistory.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              לא נמצאה היסטוריית מחירים עבור ספק זה.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border-2 border-border shadow-sm max-h-[400px]">
              <Table>
                <TableHeader>
                          <TableRow className="bg-linear-to-r from-muted to-muted/50 border-b-2">
                    <TableHead>תאריך</TableHead>
                    <TableHead>מחיר עלות</TableHead>
                    <TableHead>אחוז רווח</TableHead>
                    <TableHead>מחיר מכירה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                          {priceHistory.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.created_at)}</TableCell>
                      <TableCell>{formatPrice(Number(row.cost_price))}</TableCell>
                      <TableCell>{Number(row.margin_percent).toFixed(1)}%</TableCell>
                      <TableCell className="font-bold text-primary">
                        {formatPrice(Number(row.sell_price))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
