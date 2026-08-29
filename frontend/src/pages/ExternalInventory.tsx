import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Minus, PackagePlus, Plus, Search, Warehouse } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { externalInventoryApi, productsApi, type Product } from '../lib/api';

const unitLabels = { unit: 'יח׳', kg: 'ק״ג', liter: 'ליטר' } as const;

const PRODUCT_PAGE_SIZE = 100;

async function loadAllProductsForExternalInventory(): Promise<Product[]> {
  const firstPage = await productsApi.list({ page: 1, pageSize: PRODUCT_PAGE_SIZE, sort: 'updated_desc' });
  if (firstPage.totalPages <= 1) return firstPage.products;

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      productsApi.list({ page: index + 2, pageSize: PRODUCT_PAGE_SIZE, sort: 'updated_desc' }),
    ),
  );
  return [
    ...firstPage.products,
    ...remainingPages.flatMap((page) => page.products),
  ];
}

export default function ExternalInventory() {
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState('');
  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsIsError,
    error: productsError,
  } = useQuery({
    queryKey: ['external-inventory', 'products'],
    queryFn: loadAllProductsForExternalInventory,
  });
  const { data, isLoading: inventoryLoading } = useQuery({
    queryKey: ['external-inventory'],
    queryFn: externalInventoryApi.list,
  });

  const items = data?.items ?? [];
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId],
  );
  const suggestions = useMemo(() => {
    const term = productSearch.trim().toLocaleLowerCase('he-IL');
    return products
      .filter((product) => !term || `${product.name} ${product.sku ?? ''}`.toLocaleLowerCase('he-IL').includes(term));
  }, [productSearch, products]);

  const adjustMutation = useMutation({
    mutationFn: ({ productId, delta }: { productId: string; delta: number }) =>
      externalInventoryApi.adjust(productId, delta),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['external-inventory'] });
    },
    onError: (cause: Error) => setError(cause.message || 'לא ניתן לעדכן מלאי חיצוני'),
  });

  const addSelectedProduct = () => {
    if (!selectedProductId) {
      setError('יש לבחור מוצר לפני הוספה למלאי חיצוני.');
      return;
    }
    adjustMutation.mutate({ productId: selectedProductId, delta: 1 });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 page-shell">
      <div className="page-hero">
        <div>
          <h1 className="page-title inline-flex items-center gap-2">
            <Warehouse className="h-7 w-7 text-violet-500" />
            ניהול מלאי חיצוני
          </h1>
          <p className="page-subtitle">מלאי עצמאי שאינו משפיע על מלאי הספקים, מחירים או התראות מלאי.</p>
        </div>
      </div>

      <Card className="tools-card">
        <CardHeader>
          <CardTitle className="text-lg">הוספת מוצר למלאי חיצוני</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative min-w-0 flex-1 space-y-1">
              <Label htmlFor="external-inventory-product">חיפוש מוצר</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                id="external-inventory-product"
                className="pr-9"
                value={productSearch}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setSelectedProductId('');
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={productsLoading ? 'טוען מוצרים…' : 'הקלד שם מוצר או מק״ט…'}
                disabled={productsLoading}
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls="external-inventory-suggestions"
              />
              </div>
              {showSuggestions && (
                <div id="external-inventory-suggestions" role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                  <p className="px-3 py-1.5 text-xs text-muted-foreground">
                    {productSearch.trim() ? `${suggestions.length} מוצרים תואמים` : `${products.length} מוצרים`}
                  </p>
                  {suggestions.length > 0 ? suggestions.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      role="option"
                      className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-right text-sm hover:bg-accent"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedProductId(product.id);
                        setProductSearch(product.name);
                        setShowSuggestions(false);
                        setError('');
                      }}
                    >
                      <span className="min-w-0 truncate font-medium">{product.name}</span>
                      {product.sku && <span className="shrink-0 text-xs text-muted-foreground">{product.sku}</span>}
                    </button>
                  )) : (
                    <p className="px-3 py-2 text-sm text-muted-foreground">לא נמצאו מוצרים שמתאימים לחיפוש.</p>
                  )}
                </div>
              )}
            </div>
            <Button type="button" onClick={addSelectedProduct} disabled={adjustMutation.isPending || productsLoading}>
              <PackagePlus className="h-4 w-4" />
              הוסף למלאי (+1)
            </Button>
          </div>
          {selectedProduct && <p className="text-xs text-muted-foreground">המוצר הנבחר: {selectedProduct.name}</p>}
          {productsIsError && <p role="alert" className="text-sm text-destructive">{productsError instanceof Error ? productsError.message : 'לא ניתן לטעון את רשימת המוצרים.'}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card className="data-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border">
          <CardTitle className="text-lg">המלאי החיצוני שלי</CardTitle>
          <span className="text-sm text-muted-foreground">{items.length} מוצרים</span>
        </CardHeader>
        <CardContent className="p-0">
          {inventoryLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">טוען מלאי חיצוני…</p>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              עדיין לא נוספו מוצרים למלאי החיצוני.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.product_id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link to={`/products/${item.product_id}/edit`} className="font-semibold hover:text-primary hover:underline">
                      {item.product_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">מלאי חיצוני בלבד</p>
                  </div>
                  <div className="flex items-center gap-2" dir="ltr">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`הפחת מלאי עבור ${item.product_name}`}
                      onClick={() => adjustMutation.mutate({ productId: item.product_id, delta: -1 })}
                      disabled={adjustMutation.isPending}
                    >
                      <Minus />
                    </Button>
                    <span className="min-w-16 text-center text-lg font-bold tabular-nums">
                      {item.quantity} <span className="text-xs font-normal text-muted-foreground">{unitLabels[item.unit]}</span>
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      aria-label={`הוסף מלאי עבור ${item.product_name}`}
                      onClick={() => adjustMutation.mutate({ productId: item.product_id, delta: 1 })}
                      disabled={adjustMutation.isPending}
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
