import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Boxes, MoonStar, Sun, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { useProducts } from '../hooks/useProducts';
import { useSuppliers } from '../hooks/useSuppliers';
import { supabase } from '../lib/supabase';

type RecentRow = {
  id: string;
  productName: string;
  supplierName: string;
  price: number;
  changePercent: number;
  changeDirection: 'up' | 'down' | 'none';
};

function formatPrice(value: number): string {
  return `₪${value.toFixed(2)}`;
}

function formatChange(change: number): string {
  if (change === 0) return '0.0%';
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
}

export default function Dashboard() {
  const [displayName, setDisplayName] = useState('שם משתמש');

  const { data: productsData, isLoading } = useProducts({
    sort: 'updated_desc',
    page: 1,
    pageSize: 100,
  });
  const { data: suppliers = [] } = useSuppliers();

  const products = productsData?.products ?? [];
  const allPriceRows = products
    .flatMap((p) =>
      (p.prices ?? []).map((price, idx) => ({
        id: `${p.id}-${price.id ?? price.supplier_id ?? 'no-supplier'}-${price.created_at ?? p.updated_at ?? idx}-${idx}`,
        productId: p.id,
        productName: p.name,
        supplierId: price.supplier_id,
        supplierName: price.supplier?.name || price.supplier_name || 'ללא ספק',
        price: Number(price.cost_price_after_discount ?? price.cost_price ?? 0),
        createdAt: price.created_at || p.updated_at,
      })),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const latestByPair = new Map<string, typeof allPriceRows>();
  for (const row of allPriceRows) {
    const key = `${row.productId}:${row.supplierId}`;
    if (!latestByPair.has(key)) latestByPair.set(key, []);
    latestByPair.get(key)!.push(row);
  }

  const recentRows: RecentRow[] = Array.from(latestByPair.values())
    .map((rows) => {
      const current = rows[0];
      const previous = rows[1];
      const previousPrice = previous?.price ?? current.price;
      const diff = previousPrice > 0 ? ((current.price - previousPrice) / previousPrice) * 100 : 0;
      const direction: RecentRow['changeDirection'] = diff >= 0 ? 'up' : diff < 0 ? 'down' : 'none';
      return {
        id: current.id,
        productName: current.productName,
        supplierName: current.supplierName,
        price: current.price,
        changePercent: Math.abs(diff),
        changeDirection: direction,
      };
    })
    .slice(0, 8);

  const increasing = recentRows.filter((r) => r.changeDirection === 'up').length;
  const decreasing = recentRows.filter((r) => r.changeDirection === 'down').length;
  const activeSuppliers = suppliers.filter((s) => s.is_active !== false).length;
  const totalProducts = productsData?.total ?? products.length;
  const hour = new Date().getHours();
  const isMorning = hour >= 5 && hour < 17;
  const greeting = isMorning ? 'בוקר טוב' : 'ערב טוב';
  const GreetingIcon = isMorning ? Sun : MoonStar;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const dbName = (profile?.full_name || '').trim();
      if (dbName) {
        setDisplayName(dbName);
        return;
      }

      const metaName = (user.user_metadata as { full_name?: string } | null)?.full_name?.trim();
      if (metaName) {
        setDisplayName(metaName);
        return;
      }
      const emailName = user.email?.split('@')[0]?.trim();
      if (emailName) {
        setDisplayName(emailName);
      }
    });
  }, []);

  const greetingLine = useMemo(() => `היי ${displayName}, ${greeting}`, [displayName, greeting]);

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <h1 className="page-title inline-flex items-center gap-2">
            <GreetingIcon className="h-7 w-7 text-amber-500" />
            <span>{greetingLine}</span>
          </h1>
          <p className="page-subtitle">סקירה כללית של המערכת</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="surface-elevated">
          <CardContent className="flex items-center justify-between p-4">
            <div className="rounded-xl bg-sky-500 p-3 text-white"><Truck className="h-5 w-5" /></div>
            <div className="w-28 text-center">
              <p className="text-xs text-muted-foreground">ספקים פעילים</p>
              <p className="text-xl font-bold tabular-nums leading-none">{activeSuppliers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-elevated">
          <CardContent className="flex items-center justify-between p-4">
            <div className="rounded-xl bg-emerald-500 p-3 text-white"><Boxes className="h-5 w-5" /></div>
            <div className="w-28 text-center">
              <p className="text-xs text-muted-foreground">מוצרים</p>
              <p className="text-xl font-bold tabular-nums leading-none">{totalProducts}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-elevated">
          <CardContent className="flex items-center justify-between p-4">
            <div className="rounded-xl bg-rose-500 p-3 text-white"><TrendingUp className="h-5 w-5" /></div>
            <div className="w-28 text-center">
              <p className="text-xs text-muted-foreground">עליות מחיר</p>
              <p className="text-xl font-bold tabular-nums leading-none">{increasing}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-elevated">
          <CardContent className="flex items-center justify-between p-4">
            <div className="rounded-xl bg-teal-500 p-3 text-white"><TrendingDown className="h-5 w-5" /></div>
            <div className="w-28 text-center">
              <p className="text-xs text-muted-foreground">ירידות מחיר</p>
              <p className="text-xl font-bold tabular-nums leading-none">{decreasing}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="data-card">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-lg font-bold">עדכוני מחירים אחרונים</h3>
            <Link to="/products" className="text-sm text-primary hover:underline">צפה בהכל</Link>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-5 text-sm text-muted-foreground">טוען נתונים...</div>
            ) : recentRows.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">אין עדכונים להצגה</div>
            ) : (
              recentRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-muted/30"
                  dir="rtl"
                >
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground transition-transform duration-200 hover:scale-105"
                    aria-label="השוואה"
                    title="השוואה"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                  <div className="flex-1 text-right">
                    <div className="text-[0.875rem] font-semibold leading-tight">{row.productName}</div>
                    <div className="text-xs text-muted-foreground">{row.supplierName}</div>
                  </div>
                  <div className="w-[110px] text-left" dir="ltr">
                    <div className="text-xs font-bold tabular-nums leading-tight">{formatPrice(row.price)}</div>
                    <div
                      className={`text-xs ${
                        row.changeDirection === 'down' || row.changeDirection === 'none'
                          ? 'text-rose-500'
                        : row.changeDirection === 'up'
                          ? 'text-emerald-500'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {formatChange(row.changePercent)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
