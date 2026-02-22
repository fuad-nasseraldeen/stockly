import { resolveColumns, type Settings, type ColumnLayout } from './column-resolver';
import { loadLayout, mergeWithDefaults, type LayoutKey } from './column-layout-storage';
import { grossToNet, calculateProfitAmount } from './pricing-rules';
import { formatNumberTrimmed, getDecimalPrecision } from './number-format';

type TablePdfColumn = { key: string; label: string };

function formatMoney(value: number, settings: Settings) {
  if (Number.isNaN(value)) return '-';
  return `₪${formatNumberTrimmed(value, getDecimalPrecision(settings))}`;
}

function formatDateHe(date: string | null | undefined) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('he-IL');
}

function getPackageQuantity(price: any, product: any): number {
  const pricePackageQty = price?.package_quantity;
  const productPackageQty = product?.package_quantity;

  const n1 = Number(pricePackageQty);
  if (pricePackageQty !== null && pricePackageQty !== undefined && !Number.isNaN(n1) && n1 > 0) return n1;

  const n2 = Number(productPackageQty);
  if (productPackageQty !== null && productPackageQty !== undefined && !Number.isNaN(n2) && n2 > 0) return n2;

  return 1;
}

export async function getPriceTableExportLayout(settings: Settings, layoutKey: LayoutKey) {
  const saved = await loadLayout(layoutKey);
  const merged = saved ? mergeWithDefaults(saved) : undefined;
  const resolved = resolveColumns(settings, merged as Partial<ColumnLayout> | undefined)
    // Never export internal-only columns
    .filter((c) => c.id !== 'actions' && c.id !== 'cost_after_discount_net' && c.id !== 'profit_amount');

  const columns: TablePdfColumn[] = resolved.map((c) => ({
    key: c.id,
    label: c.headerLabel,
  }));

  return { resolved, columns };
}

export function priceRowToExportValues(params: {
  price: any;
  product: any;
  settings: Settings;
  columnKeys: string[];
}): Array<string | number | null> {
  const { price, product, settings, columnKeys } = params;
  const vatRate = (settings.vat_percent || 18) / 100;

  return columnKeys.map((key) => {
    switch (key) {
      case 'supplier':
        return price?.supplier_name || '-';

      case 'cost_gross':
        return formatMoney(Number(price?.cost_price || 0), settings);

      case 'cost_net': {
        const net = grossToNet(Number(price?.cost_price || 0), vatRate);
        return formatMoney(net, settings);
      }

      case 'discount': {
        const d = Number(price?.discount_percent || 0);
        return d > 0 ? `${d.toFixed(1)}%` : '-';
      }

      case 'cost_after_discount_gross': {
        const v = Number(price?.cost_price_after_discount || price?.cost_price || 0);
        return formatMoney(v, settings);
      }

      case 'cost_after_discount_net': {
        const gross = Number(price?.cost_price_after_discount || price?.cost_price || 0);
        const net = grossToNet(gross, vatRate);
        return formatMoney(net, settings);
      }

      case 'quantity_per_carton': {
        const q = getPackageQuantity(price, product);
        return `${q} יח'`;
      }

      case 'carton_price': {
        const gross = Number(price?.cost_price_after_discount || price?.cost_price || 0);
        const q = getPackageQuantity(price, product);
        return formatMoney(gross * q, settings);
      }

      case 'sell_price': {
        if (!price?.sell_price) return '-';
        return formatMoney(Number(price.sell_price), settings);
      }

      case 'profit_amount': {
        if (!price?.sell_price) return '-';
        const profit = calculateProfitAmount(
          Number(price.sell_price),
          Number(price?.cost_price_after_discount || price?.cost_price || 0)
        );
        return formatMoney(profit, settings);
      }

      case 'profit_percent': {
        const mp = Number(price?.margin_percent || 0);
        return mp > 0 ? `${mp.toFixed(1)}%` : '-';
      }

      case 'date':
        return formatDateHe(price?.created_at);

      case 'product_name':
        return product?.name || '-';

      case 'sku':
        return product?.sku || '-';

      default:
        return '-';
    }
  });
}

