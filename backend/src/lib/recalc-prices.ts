/**
 * Shared logic for recalculating all product prices with current tenant settings.
 * Used by: settings PUT (on save), import apply (after import), and manual recalc endpoint.
 */
import { supabase } from './supabase.js';
import { calcCostAfterDiscount, calcSellPrice, clampDecimalPrecision, roundToPrecision } from './pricing.js';

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export type RecalcResult = { updated: number };

export async function runRecalcPricesForTenant(
  tenantId: string,
  userId: string,
  options?: { retries?: number },
): Promise<RecalcResult> {
  const maxRetries = options?.retries ?? 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data: settings, error: settingsErr } = await supabase
        .from('settings')
        .select('vat_percent,global_margin_percent,use_margin,use_vat,decimal_precision')
        .eq('tenant_id', tenantId)
        .single();

      if (settingsErr || !settings) {
        throw new Error('שגיאה בטעינת הגדרות');
      }

      const newVat = Number(settings.vat_percent ?? 18);
      const newMargin = Number(settings.global_margin_percent ?? 0);
      const newUseMargin = settings.use_margin === true;
      const newUseVat = settings.use_vat === true;
      const decimalPrecision = clampDecimalPrecision((settings as Record<string, unknown>)?.decimal_precision, 2);

      const currentRows: Array<Record<string, unknown>> = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: page, error: pageErr } = await supabase
          .from('product_supplier_current_price')
          .select('product_id,supplier_id,cost_price,discount_percent,cost_price_after_discount,sell_price,package_quantity,package_type,source_price_includes_vat,vat_rate,effective_from')
          .eq('tenant_id', tenantId)
          .range(offset, offset + pageSize - 1);
        if (pageErr) throw new Error('שגיאה בטעינת מחירים');
        if (!page || page.length === 0) break;
        currentRows.push(...(page as Array<Record<string, unknown>>));
        if (page.length < pageSize) break;
        offset += pageSize;
      }

      if (currentRows.length === 0) {
        return { updated: 0 };
      }

      const pairKeys = new Set(currentRows.map((r) => `${r.product_id}||${r.supplier_id}`));
      const latestPriceByPair = new Map<
        string,
        { cost_price: number; discount_percent: number | null; margin_percent: number; sell_price: number }
      >();

      let peOffset = 0;
      const pePageSize = 1000;
      while (latestPriceByPair.size < pairKeys.size) {
        const { data: pePage } = await supabase
          .from('price_entries')
          .select('product_id,supplier_id,cost_price,discount_percent,margin_percent,sell_price,created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .range(peOffset, peOffset + pePageSize - 1);
        if (!pePage || pePage.length === 0) break;
        for (const p of pePage as Array<Record<string, unknown>>) {
          const key = `${p.product_id}||${p.supplier_id}`;
          if (pairKeys.has(key) && !latestPriceByPair.has(key)) {
            latestPriceByPair.set(key, {
              cost_price: Number(p.cost_price),
              discount_percent: p.discount_percent === null ? null : Number(p.discount_percent),
              margin_percent: Number(p.margin_percent ?? 0),
              sell_price: Number(p.sell_price),
            });
          }
        }
        if (pePage.length < pePageSize) break;
        peOffset += pePageSize;
      }

      const priceRowsToInsert: Array<Record<string, unknown>> = [];
      for (const row of currentRows) {
        const cost = Number(row.cost_price);
        if (!Number.isFinite(cost) || cost < 0) continue;

        const discountPercent = Number(row.discount_percent ?? 0);
        const costAfterDiscount = row.cost_price_after_discount
          ? Number(row.cost_price_after_discount)
          : calcCostAfterDiscount(cost, discountPercent, decimalPrecision);

        const sellPrice = calcSellPrice({
          cost_price: cost,
          margin_percent: newMargin,
          vat_percent: newVat,
          cost_price_after_discount: costAfterDiscount,
          use_margin: newUseMargin,
          use_vat: newUseVat,
          precision: decimalPrecision,
        });

        const newMarginRounded = roundToPrecision(newMargin, decimalPrecision);
        const key = `${row.product_id}||${row.supplier_id}`;
        const current = latestPriceByPair.get(key);

        const same =
          current &&
          Number(current.cost_price) === cost &&
          Number(current.discount_percent ?? 0) === discountPercent &&
          Number(current.sell_price) === sellPrice &&
          Number(current.margin_percent) === newMarginRounded;

        if (!same) {
          priceRowsToInsert.push({
            tenant_id: tenantId,
            product_id: row.product_id,
            supplier_id: row.supplier_id,
            cost_price: cost,
            discount_percent: roundToPrecision(discountPercent, decimalPrecision),
            cost_price_after_discount: costAfterDiscount,
            margin_percent: roundToPrecision(newMargin, decimalPrecision),
            sell_price: sellPrice,
            package_quantity: row.package_quantity ?? null,
            package_type: row.package_type ?? 'unknown',
            source_price_includes_vat: row.source_price_includes_vat ?? false,
            vat_rate: row.vat_rate ?? null,
            effective_from: row.effective_from ?? null,
            created_by: userId,
          });
        }
      }

      let inserted = 0;
      if (priceRowsToInsert.length > 0) {
        for (const part of chunk(priceRowsToInsert, 500)) {
          const { error: insertError } = await supabase.from('price_entries').insert(part);
          if (insertError) throw insertError;
          inserted += part.length;
        }
      }

      return { updated: inserted };
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) throw err;
      console.warn(`Recalc prices attempt ${attempt + 1} failed, retrying...`, err);
    }
  }

  return { updated: 0 };
}
