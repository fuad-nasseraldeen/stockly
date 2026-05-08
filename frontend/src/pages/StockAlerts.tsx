import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useSettings } from '../hooks/useSettings';
import { useLowStockList } from '../hooks/useStock';

export default function StockAlerts() {
  const { data: settings } = useSettings();
  const stockOn = settings?.stock_tracking_enabled === true;
  const [q, setQ] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [appliedQ, setAppliedQ] = useState('');
  const [appliedCritical, setAppliedCritical] = useState(false);

  const { data, isLoading, isFetching } = useLowStockList({
    q: appliedQ,
    critical: appliedCritical,
    enabled: stockOn,
  });

  const items = data?.items ?? [];

  const rows = useMemo(() => {
    return [...items].sort((a, b) => {
      const deficit = (i: typeof a) => i.min_threshold - i.stock_quantity;
      return deficit(b) - deficit(a);
    });
  }, [items]);

  const applyFilters = () => {
    setAppliedQ(q.trim());
    setAppliedCritical(criticalOnly);
  };

  if (!stockOn) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              התראות מלאי
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            מעקב מלאי כבוי בהגדרות החנות. באפשרותך להפעיל אותו תחת{' '}
            <Link to="/settings" className="text-primary underline">
              הגדרות
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl page-shell">
      <div className="page-hero">
        <div>
          <h1 className="page-title">מלאי נמוך</h1>
          <p className="page-subtitle">
            רשימה נגזרת בזמן אמת — מוצרים שכמות המלאי קטנה או שווה לסף שהגדרת לכל ספק.
          </p>
        </div>
      </div>

      <Card className="tools-card">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label htmlFor="stock-alert-search">חיפוש לפי מוצר או ספק</Label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="stock-alert-search"
                  className="pr-9"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="חפש…"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={criticalOnly}
                onChange={(e) => setCriticalOnly(e.target.checked)}
              />
              רק מלאי אפס (קריטי)
            </label>
            <Button type="button" onClick={applyFilters} disabled={isFetching}>
              החל סינון
            </Button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">טוען…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">אין פריטים בסף או מתחתיו.</p>
          ) : (
            <div className="data-table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מוצר</TableHead>
                    <TableHead>ספק</TableHead>
                    <TableHead className="text-left">מלאי</TableHead>
                    <TableHead className="text-left">סף</TableHead>
                    <TableHead className="text-left">חוסר</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const gap = row.min_threshold - row.stock_quantity;
                    const critical = row.stock_quantity <= 0;
                    return (
                      <TableRow key={row.id} className={critical ? 'bg-destructive/5' : ''}>
                        <TableCell className="font-medium">{row.product_name}</TableCell>
                        <TableCell>{row.supplier_name}</TableCell>
                        <TableCell className="text-left tabular-nums">{row.stock_quantity}</TableCell>
                        <TableCell className="text-left tabular-nums">{row.min_threshold}</TableCell>
                        <TableCell
                          className={`text-left tabular-nums ${gap > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                          {gap}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/products/${row.product_id}/edit`}>למוצר</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
