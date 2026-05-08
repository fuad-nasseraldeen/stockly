import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { useProducts } from '../hooks/useProducts';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';

let am5LicenseAdded = false;
function ensureAmChartsLicense() {
  if (am5LicenseAdded) return;
  am5.addLicense('AM5C-7088-9990-9365-5562');
  am5LicenseAdded = true;
}

type SupplierPoint = {
  supplierId: string;
  supplierName: string;
  price: number;
  previousPrice: number;
  updatedAt: string;
};

export default function ComparePrices() {
  const { data: productsData, isLoading } = useProducts({ sort: 'updated_desc', page: 1, pageSize: 200 });
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const chartRef = useRef<HTMLDivElement | null>(null);

  const products = productsData?.products ?? [];
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  useEffect(() => {
    if (!filteredProducts.length) {
      if (selectedProductId) setSelectedProductId('');
      return;
    }
    const selectedStillVisible = filteredProducts.some((p) => p.id === selectedProductId);
    if (!selectedProductId || !selectedStillVisible) {
      setSelectedProductId(filteredProducts[0].id);
    }
  }, [filteredProducts, selectedProductId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const points = useMemo<SupplierPoint[]>(() => {
    if (!selectedProduct?.prices?.length) return [];
    const bySupplier = new Map<string, Array<{ price: number; createdAt: string; supplierName: string }>>();
    for (const row of selectedProduct.prices) {
      const supplierId = row.supplier_id;
      const price = Number(row.cost_price_after_discount ?? row.cost_price ?? 0);
      if (!Number.isFinite(price) || price <= 0) continue;
      const createdAt = row.created_at || '';
      const supplierName = row.supplier?.name || row.supplier_name || 'ללא ספק';
      if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, []);
      bySupplier.get(supplierId)!.push({ price, createdAt, supplierName });
    }

    const rows: SupplierPoint[] = [];
    for (const [supplierId, entries] of bySupplier.entries()) {
      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const current = entries[0];
      const previous = entries[1] ?? entries[0];
      rows.push({
        supplierId,
        supplierName: current.supplierName,
        price: current.price,
        previousPrice: previous.price,
        updatedAt: current.createdAt,
      });
    }

    return rows.sort((a, b) => a.price - b.price);
  }, [selectedProduct]);

  const lowest = points[0];
  const highest = points[points.length - 1];

  useEffect(() => {
    if (!chartRef.current) return;
    if (!points.length) return;

    ensureAmChartsLicense();

    const root = am5.Root.new(chartRef.current);
    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        layout: root.verticalLayout,
        panX: false,
        panY: false,
        paddingLeft: 44,
        paddingRight: 22,
        paddingTop: 2,
        paddingBottom: 0,
      }),
    );

    const yRenderer = am5xy.AxisRendererY.new(root, {
      inversed: true,
      minGridDistance: 16,
      cellStartLocation: 0.14,
      cellEndLocation: 0.86,
      inside: false,
    });
    yRenderer.grid.template.setAll({
      visible: false,
      forceHidden: true,
    });
    yRenderer.setAll({
      stroke: am5.color(0x94a3b8),
      strokeOpacity: 0.9,
      strokeWidth: 1.2,
    });
    yRenderer.labels.template.setAll({
      oversizedBehavior: 'none',
      textAlign: 'left',
      maxWidth: 156,
      paddingRight: 8,
      fontSize: 15,
      fontWeight: '500',
      fill: am5.color(0x475569),
    });
    const yAxis = chart.yAxes.push(am5xy.CategoryAxis.new(root, { categoryField: 'supplier', renderer: yRenderer }));

    const xAxis = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererX.new(root, {
          minGridDistance: 50,
        }),
        min: 0,
        strictMinMax: true,
        extraMax: 0.5,
      }),
    );
    xAxis.get('renderer').labels.template.setAll({
      fontSize: 12,
      fill: am5.color(0x64748b),
      textAlign: 'center',
      paddingTop: 6,
    });
    xAxis.get('renderer').labels.template.adapters.add('text', (text) => {
      if (!text) return text;
      const clean = text.replace(/^₪\s?/, '');
      return `₪${clean}`;
    });
    xAxis.get('renderer').grid.template.setAll({
      stroke: am5.color(0xd1d5db),
      strokeOpacity: 0.42,
      strokeDasharray: [4, 4],
    });
    const zeroAxisLine = chart.plotContainer.children.push(
      am5.Graphics.new(root, {
        stroke: am5.color(0x94a3b8),
        strokeOpacity: 1,
        strokeWidth: 1.8,
        layer: 1000,
        isMeasured: false,
      }),
    );
    const drawZeroAxisLine = () => {
      const plotWidth = chart.plotContainer.width();
      const plotHeight = chart.plotContainer.height();
      const xPos = xAxis.valueToPosition(0) * plotWidth;
      zeroAxisLine.set('draw', (display) => {
        display.moveTo(xPos, 0);
        display.lineTo(xPos, plotHeight);
      });
    };
    const zeroLineDisposer = root.events.on('frameended', drawZeroAxisLine);

    const series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: 'מחיר',
        xAxis,
        yAxis,
        valueXField: 'price',
        categoryYField: 'supplier',
        tooltip: am5.Tooltip.new(root, {
          labelText: '{categoryY}\nמחיר: ₪{valueX.formatNumber("#,###.00")}',
        }),
      }),
    );
    series.set('sequencedInterpolation', true);
    const seriesTooltip = series.get('tooltip');
    if (seriesTooltip) {
      seriesTooltip.setAll({
        getFillFromSprite: false,
        getStrokeFromSprite: false,
        autoTextColor: false,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 10,
        paddingRight: 10,
      });
      seriesTooltip.get('background')?.setAll({
        fill: am5.color(0xffffff),
        fillOpacity: 1,
        stroke: am5.color(0xd1d5db),
        strokeOpacity: 1,
      });
      seriesTooltip.label.setAll({
        fill: am5.color(0x111827),
        fontSize: 12,
        fontWeight: '400',
        textAlign: 'center',
        direction: 'ltr',
        oversizedBehavior: 'truncate',
        maxWidth: 180,
      });
    }

    const columnHeight = points.length <= 1 ? am5.percent(44) : am5.percent(72);
    series.columns.template.setAll({
      cornerRadiusTR: 8,
      cornerRadiusBR: 8,
      cornerRadiusTL: 0,
      cornerRadiusBL: 0,
      strokeOpacity: 0,
      height: columnHeight,
      tooltipText: '{categoryY}\nמחיר: ₪{valueX.formatNumber("#,###.00")}',
    });

    series.columns.template.adapters.add('fill', (_, target) => {
      const i = Number((target.dataItem?.dataContext as { idx?: number } | undefined)?.idx ?? 0);
      const palette = ['#1d6ed8', '#2fb78b', '#e88f2d', '#e84d67', '#6f5bd8'];
      return am5.color(palette[i % palette.length]);
    });
    series.columns.template.adapters.add('stroke', (_, target) => {
      const i = Number((target.dataItem?.dataContext as { idx?: number } | undefined)?.idx ?? 0);
      const palette = ['#1d6ed8', '#2fb78b', '#e88f2d', '#e84d67', '#6f5bd8'];
      return am5.color(palette[i % palette.length]);
    });

    const chartData = points.map((p, idx) => ({ supplier: p.supplierName, price: p.price, idx }));
    yAxis.data.setAll(chartData);
    series.data.setAll(chartData);
    series.columns.template.set('cursorOverStyle', 'pointer');
    series.columns.template.events.on('pointerover', (ev) => {
      const dataItem = ev.target.dataItem;
      if (dataItem && seriesTooltip) {
        series.showDataItemTooltip(dataItem);
      }
    });
    series.columns.template.events.on('click', (ev) => {
      const col = ev.target;
      const dataItem = col.dataItem;
      if (dataItem && seriesTooltip) {
        series.showDataItemTooltip(dataItem);
      }
      col.animate({ key: 'scale', from: 1, to: 1.05, duration: 130, easing: am5.ease.out(am5.ease.cubic) });
      window.setTimeout(() => {
        col.animate({ key: 'scale', from: 1.05, to: 1, duration: 180, easing: am5.ease.out(am5.ease.cubic) });
      }, 130);
    });
    window.requestAnimationFrame(() => root.resize());

    series.appear(1400);
    chart.appear(1400, 120);

    return () => {
      zeroLineDisposer.dispose();
      root.dispose();
    };
  }, [points]);

  const formatDate = (date: string): string => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('he-IL');
  };

  return (
    <div className="page-shell" dir="rtl">
      <div className="page-hero">
        <div>
          <h1 className="page-title">השוואת מחירים</h1>
          <p className="page-subtitle">השוואת מחירים של מוצר בין ספקים שונים</p>
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
        <CardContent className="space-y-2 p-5">
          <label className="text-sm font-medium">בחר מוצר להשוואה</label>
          <Input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="חפש מוצר לפי שם..."
            className="focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {productSearch.trim() && filteredProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground">לא נמצאו מוצרים עבור החיפוש שהוקלד.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          className="rounded-xl border"
          style={{
            backgroundColor: '#f0fdfa80',
            borderColor: 'rgb(167 243 208 / .7)',
            boxShadow:
              'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), 0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)',
          }}
        >
          <CardContent className="p-5 text-right">
            <div className="mb-4 flex items-center gap-2 text-emerald-700">
              <Crown className="h-6 w-6" />
              <span className="text-2xl font-medium">המחיר הזול ביותר</span>
            </div>
            <p className="text-xl font-bold leading-none" style={{ color: '#0f766e' }}>
              {lowest ? `₪${lowest.price.toFixed(2)}` : '-'}
            </p>
            <p className="mt-3 text-xl text-emerald-700">{lowest?.supplierName ?? '-'}</p>
          </CardContent>
        </Card>
        <Card
          className="rounded-xl border"
          style={{
            borderColor: 'rgb(254 205 211 / 1)',
            backgroundColor: 'rgb(254 242 242 / .7)',
            boxShadow:
              'var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), 0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)',
          }}
        >
          <CardContent className="p-5 text-right">
            <div className="mb-4 flex items-center gap-2 text-[#a0274a]">
              <TrendingUp className="h-6 w-6" />
              <span className="text-xl font-medium">המחיר הגבוה ביותר</span>
            </div>
            <p className="text-xl font-bold leading-none" style={{ color: 'rgb(190 18 60 / 1)' }}>
              {highest ? `₪${highest.price.toFixed(2)}` : '-'}
            </p>
            <p className="mt-3 text-2xl text-[#a0274a]">{highest?.supplierName ?? '-'}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
        <CardContent className="p-5">
          <h3 className="mb-4 text-right text-lg font-bold">השוואת מחירים לפי ספק</h3>
          {isLoading || !selectedProduct ? (
            <div className="h-[270px] rounded-lg bg-muted/40" />
          ) : points.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">אין נתוני מחירים למוצר זה</div>
          ) : (
            <div className="w-full overflow-hidden rounded-lg">
              <div ref={chartRef} className="w-full" style={{ height: '258px', maxHeight: '300px' }} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
        <CardContent className="p-5">
          <h3 className="mb-4 text-right text-lg font-bold">פירוט מלא</h3>
          <div className="space-y-2.5">
            {points.map((p, idx) => {
              const prev = p.previousPrice > 0 ? p.previousPrice : p.price;
              const delta = prev > 0 ? ((p.price - prev) / prev) * 100 : 0;
              const isWorse = delta >= 0; // לפי הבקשה: 0% ומעלה = ירוד (אדום)
              return (
                <div key={p.supplierId} className="rounded-xl bg-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold text-white ${idx === 0 ? 'bg-blue-600' : idx === 1 ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                        {idx + 1}
                      </div>
                      <div className="text-right">
                        <div className="text-base font-semibold leading-tight">{p.supplierName}</div>
                        <div className="text-[11px] text-slate-500">עודכן: {formatDate(p.updatedAt)}</div>
                      </div>
                    </div>
                    <div className="text-left" dir="ltr">
                      <div className="text-xs font-bold leading-none tabular-nums">{`₪${p.price.toFixed(2)}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {idx === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <Crown className="h-3 w-3" /> הזול ביותר
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 ${isWorse ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {isWorse ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {isWorse ? '+' : ''}{delta.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
