import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { stockApi } from '../lib/api';
import { useAppToast } from '../contexts/AppToastContext';
import { useSettings } from '../hooks/useSettings';
import { useTenant } from '../hooks/useTenant';

/**
 * Background poll for newly-low stock (derived query). First successful fetch establishes baseline
 * so we never toast on cold load. Only items that *enter* the low-stock set trigger a toast.
 */
export function LowStockToastMonitor() {
  const { data: settings } = useSettings();
  const { currentTenant } = useTenant();
  const { push } = useAppToast();
  const tenantId = currentTenant?.id;
  const enabled = settings?.stock_tracking_enabled === true;

  const baselineReady = useRef(false);
  const prevLowIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    baselineReady.current = false;
    prevLowIds.current = new Set();
  }, [tenantId]);

  const { data } = useQuery({
    queryKey: ['stock', 'low', 'poll', tenantId],
    queryFn: () => stockApi.listLow({ q: '' }),
    enabled: !!tenantId && enabled,
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 25_000,
  });

  useEffect(() => {
    if (!enabled || !tenantId) return;
    if (!data?.stockTrackingEnabled || !Array.isArray(data.items)) return;

    const next = new Set(data.items.map((i) => i.id));
    if (!baselineReady.current) {
      baselineReady.current = true;
      prevLowIds.current = next;
      return;
    }

    const newlyLow = data.items.filter((i) => !prevLowIds.current.has(i.id));
    if (newlyLow.length > 0) {
      const lines = newlyLow.slice(0, 4).map((i) => `${i.product_name} · ${i.supplier_name}`);
      const extra = newlyLow.length - lines.length;
      push({
        title:
          newlyLow.length === 1 ? 'מלאי נמוך' : `מלאי נמוך — ${newlyLow.length} פריטים`,
        description:
          lines.join('\n') + (extra > 0 ? `\nועוד ${extra}...` : ''),
        duration: 5000,
      });
    }
    prevLowIds.current = next;
  }, [data, enabled, tenantId, push]);

  return null;
}
