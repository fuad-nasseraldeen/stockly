import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '../hooks/useTenant';
import { useCategories } from '../hooks/useCategories';
import { useSuppliers } from '../hooks/useSuppliers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  importApi,
  type ImportApplyResponse,
  type ImportMapping,
  type ImportPreviewResponse,
  type ImportSourceType,
  type ImportValidateResponse,
} from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, RotateCcw, Upload, X } from 'lucide-react';

type WizardStep = 1 | 2 | 3 | 4;
type ImportMode = 'merge' | 'overwrite';
type LoadingPhase = 'preview' | 'validate' | 'apply';
const SELECT_NONE_VALUE = '__none__';

type MappingField = {
  key: string;
  label: string;
  shortLabel?: string;
  help: string;
  required?: boolean;
};
type ManualColumn = {
  id: string;
  fieldKey: string;
};

const baseFields: MappingField[] = [
  { key: 'product_name', label: 'שם המוצר', shortLabel: 'שם מוצר', help: 'שדה חובה', required: true },
  { key: 'sku', label: 'מק"ט', shortLabel: 'מק"ט', help: 'אופציונלי' },
  { key: 'barcode', label: 'ברקוד', shortLabel: 'ברקוד', help: 'אופציונלי' },
  { key: 'category', label: 'קטגוריה', shortLabel: 'קטגוריה', help: 'ברירת מחדל: כללי' },
  { key: 'pricing_unit', label: 'סוג יחידה', shortLabel: 'סוג יחידה', help: 'יחידה / ק"ג / ליטר' },
  { key: 'package_quantity', label: 'כמות באריזה', shortLabel: 'כמות באריזה', help: 'מספר חיובי או ריק' },
  { key: 'package_type', label: 'סוג אריזה', shortLabel: 'סוג אריזה', help: 'carton/gallon/bag וכו׳' },
  { key: 'line_total', label: 'סה"כ שורה', shortLabel: 'סה"כ', help: 'לאימות מחיר*כמות (אופציונלי)' },
  { key: 'source_price_includes_vat', label: 'המחיר כולל מע"מ', shortLabel: 'כולל מע"מ', help: 'כן/לא' },
  { key: 'vat_rate', label: 'שיעור מע"מ', shortLabel: 'שיעור מע"מ', help: 'אופציונלי 0-100' },
  { key: 'vat', label: 'מע"מ', shortLabel: 'מע"מ', help: 'אופציונלי' },
  { key: 'currency', label: 'מטבע', shortLabel: 'מטבע', help: 'אופציונלי' },
];

function getPairFields(pairCount: number): MappingField[] {
  const out: MappingField[] = [];
  for (let i = 1; i <= pairCount; i += 1) {
    out.push({ key: `price_${i}`, label: `מחיר ${i}`, shortLabel: `מחיר ${i}`, help: 'חייב להיות > 0' });
    out.push({ key: `supplier_${i}`, label: `ספק ${i}`, shortLabel: `ספק ${i}`, help: 'לזוג ספק/מחיר' });
    if (i === 1) {
      out.push({ key: 'package_quantity', label: 'כמות באריזה', shortLabel: 'כמות באריזה', help: 'מספר חיובי או ריק' });
      out.push({ key: 'pricing_unit', label: 'סוג יחידה', shortLabel: 'סוג יחידה', help: 'יחידה / ק"ג / ליטר' });
      out.push({ key: 'package_type', label: 'סוג אריזה', shortLabel: 'סוג אריזה', help: 'מומלץ למפות ליד ספק 1' });
      out.push({ key: 'source_price_includes_vat', label: 'המחיר כולל מע"מ', shortLabel: 'כולל מע"מ', help: 'כן/לא' });
      out.push({ key: 'vat_rate', label: 'שיעור מע"מ', shortLabel: 'שיעור מע"מ', help: 'אופציונלי' });
      out.push({ key: 'line_total', label: 'סה"כ שורה', shortLabel: 'סה"כ', help: 'לאימות מחיר*כמות' });
    }
    out.push({ key: `discount_percent_${i}`, label: `הנחה ${i}`, shortLabel: `הנחה ${i}`, help: 'אופציונלי 0-100' });
  }
  return out;
}

function inferPairCount(mapping: ImportMapping): number {
  let maxPair = 1;
  Object.keys(mapping).forEach((key) => {
    const m = key.match(/^(supplier|price|discount_percent)_(\d+)$/);
    if (m) maxPair = Math.max(maxPair, Number(m[2]));
  });
  return maxPair;
}

function normalizeMappingForUi(source: ImportMapping): ImportMapping {
  const next: ImportMapping = { ...source };
  if (typeof next.supplier === 'number' && typeof next.supplier_1 !== 'number') next.supplier_1 = next.supplier;
  if (typeof next.price === 'number' && typeof next.price_1 !== 'number') next.price_1 = next.price;
  if (typeof next.discount_percent === 'number' && typeof next.discount_percent_1 !== 'number') next.discount_percent_1 = next.discount_percent;
  if (typeof next.vat === 'number' && typeof next.vat_1 !== 'number') next.vat_1 = next.vat;
  if (typeof next.currency === 'number' && typeof next.currency_1 !== 'number') next.currency_1 = next.currency;
  delete next.supplier;
  delete next.price;
  delete next.discount_percent;
  return next;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function createManualColumnId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `manual-col-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeHeaderToken(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function toHebrewHeaderLabel(rawHeader: unknown): string {
  const normalized = normalizeHeaderToken(rawHeader);
  if (!normalized) return '-';

  if (['product name', 'product', 'product_name', 'name', 'שם מוצר'].includes(normalized)) return 'שם המוצר';
  if (['supplier', 'vendor', 'supplier name', 'supplier_name', 'ספק'].includes(normalized)) return 'ספק';
  if (
    [
      'cost price',
      'cost',
      'price',
      'cost_price',
      'cost before vat',
      'מחיר',
      'מחיר עלות',
      'מחיר לפני מעמ',
      'מחיר לפני מע"מ',
    ].includes(normalized)
  ) {
    return 'מחיר לפני מע"מ';
  }
  if (
    ['sell price', 'sell_price', 'price after vat', 'מחיר אחרי מעמ', 'מחיר אחרי מע"מ', 'מחיר מכירה'].includes(
      normalized,
    )
  ) {
    return 'מחיר אחרי מע"מ';
  }
  if (['sku', 'מק ט', 'מקט', 'מק"ט', 'barcode', 'ברקוד'].includes(normalized)) return 'מק"ט';
  if (['category', 'קטגוריה'].includes(normalized)) return 'קטגוריה';
  if (['pricing unit', 'pricing_unit', 'unit', 'יחידת תמחור', 'סוג יחידה'].includes(normalized)) return 'סוג יחידה';
  if (['package quantity', 'package_quantity', 'כמות באריזה'].includes(normalized)) return 'כמות באריזה';
  if (['package type', 'package_type', 'packaging', 'סוג אריזה', 'אריזה'].includes(normalized)) return 'סוג אריזה';
  if (['line total', 'line_total', 'total', 'סהכ', 'סה"כ', 'סך הכל'].includes(normalized)) return 'סה"כ';
  if (['includes vat', 'source_price_includes_vat', 'כולל מעמ', 'כולל מע"מ'].includes(normalized)) return 'כולל מע"מ';
  if (['vat rate', 'vat_rate', 'שיעור מעמ', 'שיעור מע"מ', 'אחוז מעמ', 'אחוז מע"מ'].includes(normalized)) return 'שיעור מע"מ';
  if (['effective from', 'effective_from', 'מתאריך', 'תוקף מ', 'בתוקף מתאריך'].includes(normalized)) return 'בתוקף מתאריך';
  if (['vat', 'מע"מ', 'מעמ'].includes(normalized)) return 'מע"מ';
  if (['discount', 'discount percent', 'discount_percent', 'הנחה'].includes(normalized)) return 'הנחה';
  if (['currency', 'מטבע'].includes(normalized)) return 'מטבע';
  if (['last updated', 'last_updated', 'updated at', 'updated_at'].includes(normalized)) return 'עודכן לאחרונה';

  return String(rawHeader ?? '').trim() || '-';
}

function isSupplierFieldKey(fieldKey: string): boolean {
  return fieldKey === 'supplier' || /^supplier_\d+$/.test(fieldKey);
}

function isCategoryFieldKey(fieldKey: string): boolean {
  return fieldKey === 'category';
}

function isPricingUnitFieldKey(fieldKey: string): boolean {
  return fieldKey === 'pricing_unit';
}

function isPackageTypeFieldKey(fieldKey: string): boolean {
  return fieldKey === 'package_type';
}

function isPresetValueFieldKey(fieldKey: string): boolean {
  return (
    isSupplierFieldKey(fieldKey) ||
    isCategoryFieldKey(fieldKey) ||
    isPricingUnitFieldKey(fieldKey) ||
    isPackageTypeFieldKey(fieldKey)
  );
}

function shortOptionLabel(value: string, maxLen = 26): string {
  const clean = String(value || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

function formatPricingUnitLabel(value: string): string {
  switch (String(value || '').trim().toLowerCase()) {
    case 'unit':
      return 'יחידה';
    case 'kg':
      return 'ק"ג';
    case 'liter':
      return 'ליטר';
    default:
      return value;
  }
}

function formatPackageTypeLabel(value: string): string {
  switch (String(value || '').trim().toLowerCase()) {
    case 'unknown':
      return 'לא ידוע';
    case 'carton':
      return 'קרטון';
    case 'gallon':
      return 'גלון';
    case 'bag':
      return 'שק';
    case 'bottle':
      return 'בקבוק';
    case 'pack':
      return 'מארז';
    case 'shrink':
      return 'שרינק';
    case 'sachet':
      return 'שקית';
    case 'can':
      return 'פחית';
    case 'roll':
      return 'גליל';
    default:
      return value;
  }
}

function formatPresetOptionLabel(fieldKey: string, optionValue: string): string {
  if (isPricingUnitFieldKey(fieldKey)) return formatPricingUnitLabel(optionValue);
  if (isPackageTypeFieldKey(fieldKey)) return formatPackageTypeLabel(optionValue);
  return shortOptionLabel(optionValue);
}

function detectImportSourceType(file: File): ImportSourceType {
  const name = String(file.name || '').toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  return 'excel';
}

function isValueFromKnownOptions(value: string, options: string[]): boolean {
  const v = String(value || '').trim();
  if (!v) return false;
  return options.some((opt) => String(opt || '').trim() === v);
}

function normalizePreviewCellValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ');
}

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const ss = Math.max(0, seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function ImportExport() {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const { data: suppliers = [] } = useSuppliers();

  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [sourceType, setSourceType] = useState<ImportSourceType>('excel');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [selectedPdfTableIndex, setSelectedPdfTableIndex] = useState(-1);
  const [hasHeader, setHasHeader] = useState(true);
  const [pageFrom, setPageFrom] = useState('');
  const [pageTo, setPageTo] = useState('');

  const [pairCount, setPairCount] = useState(3);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [hiddenColumns, setHiddenColumns] = useState<number[]>([]);
  const [hiddenRows, setHiddenRows] = useState<number[]>([]);
  const [showOnlyMapped, setShowOnlyMapped] = useState(false);
  const [manualColumns, setManualColumns] = useState<ManualColumn[]>([]);
  const [manualValuesByRow, setManualValuesByRow] = useState<Record<number, Record<string, string>>>({});
  const [manualGlobalValuesByFieldKey, setManualGlobalValuesByFieldKey] = useState<Record<string, string>>({});
  const [manualBulkValueByColumnId, setManualBulkValueByColumnId] = useState<Record<string, string>>({});
  const [useManualSupplier, setUseManualSupplier] = useState(true);
  const [manualSupplierName, setManualSupplierName] = useState('');
  const [manualSupplierNewName, setManualSupplierNewName] = useState('');
  const [sourceTypeHint, setSourceTypeHint] = useState<string | null>(null);

  const [validation, setValidation] = useState<ImportValidateResponse | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [overwriteConfirm, setOverwriteConfirm] = useState('');
  const [applyResult, setApplyResult] = useState<ImportApplyResponse | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase | null>(null);
  const [loadingElapsedMs, setLoadingElapsedMs] = useState(0);
  const previewTableScrollRef = useRef<HTMLDivElement | null>(null);
  const previewDragStateRef = useRef({
    isPending: false,
    isDragging: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    setLoadingElapsedMs(0);
    const timer = window.setInterval(() => {
      setLoadingElapsedMs(Date.now() - startedAt);
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [loading, loadingPhase]);

  const allFields = useMemo<MappingField[]>(() => {
    const pairFields = getPairFields(pairCount);
    const fixedBeforePairs = baseFields.filter(
      (f) =>
        !['package_quantity', 'vat', 'currency', 'pricing_unit', 'package_type', 'source_price_includes_vat', 'vat_rate', 'line_total'].includes(f.key),
    );
    const fixedAfterPairs = baseFields.filter((f) => ['vat', 'currency'].includes(f.key));
    return [...fixedBeforePairs, ...pairFields, ...fixedAfterPairs];
  }, [pairCount]);
  const supplierNames = useMemo(
    () =>
      suppliers
        .map((supplier) => String(supplier.name || '').trim())
        .filter((name): name is string => !!name)
        .sort((a, b) => a.localeCompare(b, 'he')),
    [suppliers],
  );
  const categoryNames = useMemo(() => {
    const set = new Set<string>(['כללי']);
    categories.forEach((category) => {
      const name = String(category.name || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [categories]);
  const pricingUnitOptions = useMemo(() => ['unit', 'kg', 'liter'], []);
  const packageTypeOptions = useMemo(
    () => ['unknown', 'carton', 'gallon', 'bag', 'bottle', 'pack', 'shrink', 'sachet', 'can', 'roll'],
    [],
  );
  useEffect(() => {
    if (!useManualSupplier) return;
    if (manualSupplierName.trim() || manualSupplierNewName.trim()) return;
    if (!supplierNames.length) return;
    setManualSupplierName(supplierNames[0]);
  }, [useManualSupplier, manualSupplierName, manualSupplierNewName, supplierNames]);
  const activePdfTable = useMemo(
    () => (sourceType === 'pdf' ? (preview?.tables || []).find((t) => t.tableIndex === selectedPdfTableIndex) || null : null),
    [sourceType, preview, selectedPdfTableIndex],
  );
  const sourceColumns = useMemo(
    () => (activePdfTable?.columns || preview?.columns || []),
    [activePdfTable, preview],
  );
  const sampleRowOffset = useMemo(() => Number(preview?.sampleRowOffset ?? 0), [preview]);
  const sourceSampleRows = useMemo(
    () =>
      (activePdfTable?.sampleRows || preview?.sampleRows || []).map((row) =>
        Array.isArray(row) ? row.map((cell) => normalizePreviewCellValue(cell)) : row,
      ),
    [activePdfTable, preview],
  );
  const fieldLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    allFields.forEach((f) => map.set(f.key, f.shortLabel || f.label));
    return map;
  }, [allFields]);

  const columnMap = useMemo(() => {
    const map = new Map<number, string>();
    sourceColumns.forEach((col) =>
      map.set(col.index, `${col.letter} ${col.headerValue ? `- ${toHebrewHeaderLabel(col.headerValue)}` : ''}`),
    );
    return map;
  }, [sourceColumns]);
  const mappedByColumn = useMemo(() => {
    const map = new Map<number, string>();
    Object.entries(mapping).forEach(([fieldKey, colIndex]) => {
      if (typeof colIndex === 'number') map.set(colIndex, fieldKey);
    });
    return map;
  }, [mapping]);
  const hiddenSet = useMemo(() => new Set(hiddenColumns), [hiddenColumns]);
  const hiddenRowSet = useMemo(() => new Set(hiddenRows), [hiddenRows]);
  const autoHiddenEmptySet = useMemo(() => {
    if (!sourceColumns.length) return new Set<number>();
    const isEmptyCell = (value: unknown) => String(value ?? '').trim() === '';
    const set = new Set<number>();

    for (const col of sourceColumns) {
      if (mappedByColumn.has(col.index)) continue;
      const headerEmpty = String(col.headerValue ?? '').trim() === '';
      const allSampleCellsEmpty = sourceSampleRows.every((row) => isEmptyCell(row[col.index]));
      if (headerEmpty && allSampleCellsEmpty) {
        set.add(col.index);
      }
    }

    return set;
  }, [sourceColumns, sourceSampleRows, mappedByColumn]);
  const autoHiddenDerivedSet = useMemo(() => {
    const set = new Set<number>();
    for (const col of sourceColumns) {
      const headerToken = normalizeHeaderToken(col.headerValue);
      if (headerToken.endsWith('_derived') || headerToken.includes(' derived')) {
        set.add(col.index);
      }
    }
    return set;
  }, [sourceColumns]);
  const mappedVisibleSet = useMemo(() => new Set<number>([...mappedByColumn.keys()].filter((idx) => !hiddenSet.has(idx))), [mappedByColumn, hiddenSet]);
  const visibleColumns = useMemo(() => {
    if (!sourceColumns.length) return [];
    const base = sourceColumns.filter(
      (col) => !hiddenSet.has(col.index) && !autoHiddenEmptySet.has(col.index) && !autoHiddenDerivedSet.has(col.index),
    );
    if (!showOnlyMapped || mappedVisibleSet.size === 0) return base;
    return base.filter((col) => mappedVisibleSet.has(col.index));
  }, [sourceColumns, hiddenSet, autoHiddenEmptySet, autoHiddenDerivedSet, showOnlyMapped, mappedVisibleSet]);
  const hiddenColumnDefs = useMemo(
    () => sourceColumns.filter((col) => hiddenSet.has(col.index)),
    [sourceColumns, hiddenSet],
  );
  const previewRows = useMemo(
    () => sourceSampleRows.map((row, idx) => ({ row, sourceIndex: sampleRowOffset + idx })),
    [sampleRowOffset, sourceSampleRows],
  );
  const visiblePreviewRows = useMemo(
    () => previewRows.filter((entry) => !hiddenRowSet.has(entry.sourceIndex)),
    [previewRows, hiddenRowSet],
  );
  const columnWidths = useMemo(() => {
    const widths = new Map<number, string>();
    const calcLen = (value: unknown): number => String(value ?? '').trim().length;

    for (const col of visibleColumns) {
      const mappedFieldKey = mappedByColumn.get(col.index) || '';
      const mappedFieldLabel = fieldLabelMap.get(mappedFieldKey) || '';
      const displayedHeaderLabel = toHebrewHeaderLabel(col.headerValue);
      let maxLen = Math.max(8, calcLen(col.letter), calcLen(displayedHeaderLabel), calcLen(mappedFieldLabel));

      for (const { row } of visiblePreviewRows.slice(0, 30)) {
        maxLen = Math.max(maxLen, calcLen(row[col.index]));
      }

      // Keep columns readable for Hebrew labels and edits.
      const px = Math.max(120, Math.min(320, 36 + maxLen * 8));
      widths.set(col.index, `${px}px`);
    }

    return widths;
  }, [visibleColumns, mappedByColumn, fieldLabelMap, visiblePreviewRows]);

  const isInteractiveDragTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest('input, textarea, select, button, a, [role="combobox"], [role="button"]');
  };

  const handlePreviewPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isInteractiveDragTarget(e.target)) return;
    const container = previewTableScrollRef.current;
    if (!container) return;
    previewDragStateRef.current = {
      isPending: true,
      isDragging: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
    };
    // Start dragging only after a small pointer movement threshold,
    // so normal clicks (e.g. mapping/select/delete-row) still work.
    previewDragStateRef.current.isDragging = false;
  };

  const handlePreviewPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = previewDragStateRef.current;
    const container = previewTableScrollRef.current;
    if ((!drag.isPending && !drag.isDragging) || !container) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.isDragging) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      drag.isDragging = true;
      drag.isPending = false;
      setIsPreviewDragging(true);
      container.setPointerCapture?.(e.pointerId);
    }
    container.scrollLeft = drag.startScrollLeft - dx;
    container.scrollTop = drag.startScrollTop - dy;
    e.preventDefault();
  };

  const handlePreviewPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const container = previewTableScrollRef.current;
    const drag = previewDragStateRef.current;
    if (container && drag.isDragging && drag.pointerId === e.pointerId) {
      container.releasePointerCapture?.(e.pointerId);
    }
    previewDragStateRef.current.isPending = false;
    previewDragStateRef.current.isDragging = false;
    previewDragStateRef.current.pointerId = -1;
    setIsPreviewDragging(false);
  };

  const startPreview = async (
    selectedFile: File,
    opts?: {
      sourceType?: ImportSourceType;
      sheetIndex?: number;
      tableIndex?: number;
      hasHeader?: boolean;
      previewPage?: number;
      pageFrom?: number;
      pageTo?: number;
      preserveUserSelections?: boolean;
    },
  ) => {
    setLoadingPhase('preview');
    setLoading(true);
    setError(null);
    try {
      const result = await importApi.preview(selectedFile, opts);
      setPreview(result);
      setSourceType(result.sourceType || opts?.sourceType || 'excel');
      setSheetIndex(result.selectedSheet);
      setSelectedPdfTableIndex(result.selectedTableIndex ?? -1);
      setHasHeader(result.hasHeader);
      setPreviewPage(result.previewPage || opts?.previewPage || 1);

      const preserveUserSelections = opts?.preserveUserSelections === true;
      if (!preserveUserSelections) {
        const inferredPairs = inferPairCount(result.suggestedMapping || {});
        const nextPairCount = Math.max(3, inferredPairs);
        setPairCount(nextPairCount);
        setMapping(normalizeMappingForUi(result.suggestedMapping || {}));
        setHiddenColumns([]);
        setHiddenRows([]);
        setManualColumns([]);
        setManualValuesByRow({});
        setManualGlobalValuesByFieldKey({});
        setManualBulkValueByColumnId({});
        setShowOnlyMapped(false);
      }

      setStep(2);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'שגיאה בתצוגה מקדימה'));
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const detectedType = detectImportSourceType(selectedFile);
    setFile(selectedFile);
    setValidation(null);
    setApplyResult(null);
    setSelectedPdfTableIndex(detectedType === 'pdf' ? -1 : 0);
    setSourceType(detectedType);
    setSourceTypeHint(detectedType === 'pdf' ? 'זוהה אוטומטית: PDF' : 'זוהה אוטומטית: Excel / CSV');
    setPreviewPage(1);
    await startPreview(selectedFile, {
      sourceType: detectedType,
      sheetIndex: detectedType === 'excel' ? -1 : 0,
      tableIndex: detectedType === 'pdf' ? -1 : 0,
      hasHeader: true,
      previewPage: 1,
    });
  };

  const refreshPreview = async () => {
    if (!file) return;
    await startPreview(file, {
      sourceType,
      sheetIndex,
      tableIndex: selectedPdfTableIndex,
      hasHeader,
      previewPage,
      pageFrom: pageFrom ? Number(pageFrom) : undefined,
      pageTo: pageTo ? Number(pageTo) : undefined,
    });
  };
  const previewTotalPages = Math.max(1, Number(preview?.previewTotalPages ?? 1));
  const previewTotalRows = Math.max(0, Number(preview?.previewTotalRows ?? sourceSampleRows.length));
  const goToPreviewPage = async (nextPage: number) => {
    if (!file) return;
    const safePage = Math.min(previewTotalPages, Math.max(1, nextPage));
    if (safePage === previewPage) return;
    await startPreview(file, {
      sourceType,
      sheetIndex,
      tableIndex: selectedPdfTableIndex,
      hasHeader,
      previewPage: safePage,
      pageFrom: pageFrom ? Number(pageFrom) : undefined,
      pageTo: pageTo ? Number(pageTo) : undefined,
      preserveUserSelections: true,
    });
  };

  const selectPdfTable = (tableIndex: number) => {
    setSelectedPdfTableIndex(tableIndex);
    if (tableIndex === -1) {
      setMapping(normalizeMappingForUi(preview?.suggestedMapping || {}));
      setHiddenColumns([]);
      setHiddenRows([]);
      setManualColumns([]);
      setManualValuesByRow({});
      setManualGlobalValuesByFieldKey({});
      setManualBulkValueByColumnId({});
      return;
    }
    const table = (preview?.tables || []).find((t) => t.tableIndex === tableIndex);
    if (!table) return;
    setMapping(normalizeMappingForUi(table.suggestedMapping || {}));
    setHiddenColumns([]);
    setHiddenRows([]);
    setManualColumns([]);
    setManualValuesByRow({});
    setManualGlobalValuesByFieldKey({});
    setManualBulkValueByColumnId({});
  };

  const handleValidate = async () => {
    if (!file || !preview) return;
    if (useManualSupplier && !effectiveManualSupplierName) {
      setError('בחר ספק קיים או הקלד ספק חדש לפני Validate');
      return;
    }

    const hasMappedPriceField = Object.entries(mapping).some(
      ([key, value]) => (key === 'price' || /^price_\d+$/.test(key)) && typeof value === 'number',
    );
    const hasManualPriceValue = Object.values(manualValuesByRow).some((rowValues) =>
      Object.entries(rowValues).some(
        ([key, value]) => (key === 'price' || /^price_\d+$/.test(key)) && String(value ?? '').trim() !== '',
      ),
    );
    const hasUnconfiguredManualColumn = manualColumns.some((col) => !String(col.fieldKey || '').trim());
    if (hasUnconfiguredManualColumn) {
      setError('נוספה עמודה ידנית שלא הוגדרה. בחר שדה או הסר את העמודה.');
      return;
    }
    if (!hasMappedPriceField && !hasManualPriceValue) {
      setError('חובה למפות לפחות עמודת מחיר אחת או להזין מחיר ידני לפחות בשורה אחת');
      return;
    }

    setLoadingPhase('validate');
    setLoading(true);
    setError(null);
    try {
      const result = await importApi.validateMapping(file, {
        sourceType,
        sheetIndex,
        tableIndex: sourceType === 'pdf' ? selectedPdfTableIndex : undefined,
        hasHeader,
        mapping,
        ignoredRows: hiddenRows,
        manualSupplierName: useManualSupplier ? effectiveManualSupplierName : undefined,
        manualValuesByRow: Object.keys(manualValuesByRow).length > 0 ? manualValuesByRow : undefined,
        manualGlobalValues: Object.keys(manualGlobalValuesByFieldKey).length > 0 ? manualGlobalValuesByFieldKey : undefined,
      });
      setValidation(result);
      setStep(3);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'שגיאה בבדיקת המיפוי'));
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  };

  const handleApply = async () => {
    if (!file) return;
    if (useManualSupplier && !effectiveManualSupplierName) {
      setError('בחר ספק קיים או הקלד ספק חדש לפני Apply');
      return;
    }
    if (mode === 'overwrite' && overwriteConfirm !== 'DELETE') {
      setError('במצב החלפה יש להקליד DELETE');
      return;
    }
    setLoadingPhase('apply');
    setLoading(true);
    setError(null);
    try {
      const result = await importApi.apply(file, {
        mode,
        sourceType,
        sheetIndex,
        tableIndex: sourceType === 'pdf' ? selectedPdfTableIndex : undefined,
        hasHeader,
        mapping,
        ignoredRows: hiddenRows,
        manualSupplierName: useManualSupplier ? effectiveManualSupplierName : undefined,
        manualValuesByRow: Object.keys(manualValuesByRow).length > 0 ? manualValuesByRow : undefined,
        manualGlobalValues: Object.keys(manualGlobalValuesByFieldKey).length > 0 ? manualGlobalValuesByFieldKey : undefined,
      });
      setApplyResult(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
      ]);
      setStep(4);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'שגיאה בייבוא'));
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  };

  const clearColumnMapping = (columnIndex: number) => {
    setMapping((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, value]) => {
        if (value === columnIndex) {
          next[key] = null;
        }
      });
      return next;
    });
  };

  const handleColumnFieldChange = (columnIndex: number, fieldKey: string) => {
    setError(null);
    setMapping((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, value]) => {
        if (value === columnIndex) next[key] = null;
      });
      if (!fieldKey) return next;
      next[fieldKey] = columnIndex;
      return next;
    });
  };

  const handleHideColumn = (columnIndex: number) => {
    setError(null);
    clearColumnMapping(columnIndex);
    setHiddenColumns((prev) => (prev.includes(columnIndex) ? prev : [...prev, columnIndex]));
  };

  const handleRestoreColumn = (columnIndex: number) => {
    setHiddenColumns((prev) => prev.filter((c) => c !== columnIndex));
  };
  const handleHideRow = (rowIndex: number) => {
    setHiddenRows((prev) => (prev.includes(rowIndex) ? prev : [...prev, rowIndex]));
  };
  const handleRestoreRow = (rowIndex: number) => {
    setHiddenRows((prev) => prev.filter((r) => r !== rowIndex));
  };
  const handleManualValueChange = (rowIndex: number, fieldKey: string, value: string) => {
    if (!fieldKey) return;
    setError(null);
    const rawValue = value;
    const hasMeaningfulText = rawValue.trim().length > 0;
    setManualValuesByRow((prev) => {
      const next = { ...prev };
      const rowValues = { ...(next[rowIndex] || {}) };
      if (!hasMeaningfulText) {
        delete rowValues[fieldKey];
      } else {
        rowValues[fieldKey] = rawValue;
      }

      if (Object.keys(rowValues).length === 0) {
        delete next[rowIndex];
      } else {
        next[rowIndex] = rowValues;
      }

      return next;
    });
  };
  const setMappedCellOverride = (rowIndex: number, fieldKey: string, value: string) => {
    setError(null);
    setManualValuesByRow((prev) => {
      const next = { ...prev };
      const rowValues = { ...(next[rowIndex] || {}) };
      // Keep explicit empty override during editing so value does not "jump back".
      rowValues[fieldKey] = value;
      next[rowIndex] = rowValues;
      return next;
    });
  };
  const clearMappedCellOverride = (rowIndex: number, fieldKey: string) => {
    setError(null);
    setManualValuesByRow((prev) => {
      const next = { ...prev };
      const rowValues = { ...(next[rowIndex] || {}) };
      delete rowValues[fieldKey];
      if (Object.keys(rowValues).length === 0) {
        delete next[rowIndex];
      } else {
        next[rowIndex] = rowValues;
      }
      return next;
    });
  };
  const handleMappedCellValueChange = (rowIndex: number, columnIndex: number, value: string) => {
    const mappedFieldKey = mappedByColumn.get(columnIndex);
    if (!mappedFieldKey) return;
    setMappedCellOverride(rowIndex, mappedFieldKey, value);
  };

  const addManualColumn = () => {
    setError(null);
    setManualColumns((prev) => [...prev, { id: createManualColumnId(), fieldKey: '' }]);
  };

  const updateManualColumnField = (columnId: string, nextFieldKey: string) => {
    setError(null);
    setManualColumns((prev) => {
      const current = prev.find((c) => c.id === columnId);
      if (!current || current.fieldKey === nextFieldKey) return prev;

      setManualValuesByRow((oldRows) => {
        const nextRows: Record<number, Record<string, string>> = {};
        Object.entries(oldRows).forEach(([rowIndex, values]) => {
          const row = { ...values };
          const movedValue = row[current.fieldKey];
          delete row[current.fieldKey];
          if (nextFieldKey && movedValue && !row[nextFieldKey]) {
            row[nextFieldKey] = movedValue;
          }
          if (Object.keys(row).length > 0) {
            nextRows[Number(rowIndex)] = row;
          }
        });
        return nextRows;
      });

      return prev.map((c) => (c.id === columnId ? { ...c, fieldKey: nextFieldKey } : c));
    });
  };

  const removeManualColumn = (columnId: string) => {
    setError(null);
    setManualColumns((prev) => {
      const target = prev.find((c) => c.id === columnId);
      if (!target) return prev;

      setManualValuesByRow((oldRows) => {
        const nextRows: Record<number, Record<string, string>> = {};
        Object.entries(oldRows).forEach(([rowIndex, values]) => {
          const row = { ...values };
          delete row[target.fieldKey];
          if (Object.keys(row).length > 0) {
            nextRows[Number(rowIndex)] = row;
          }
        });
        return nextRows;
      });

      return prev.filter((c) => c.id !== columnId);
    });
    setManualBulkValueByColumnId((prev) => {
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
  };

  const applyManualColumnValueToAllRows = (columnId: string) => {
    const manualCol = manualColumns.find((c) => c.id === columnId);
    if (!manualCol || !manualCol.fieldKey) return;
    const value = (manualBulkValueByColumnId[columnId] || '').trim();
    if (!value) return;
    setError(null);

    setManualGlobalValuesByFieldKey((prev) => ({ ...prev, [manualCol.fieldKey]: value }));

    setManualValuesByRow((prev) => {
      const next = { ...prev };
      for (const entry of visiblePreviewRows) {
        const rowIndex = entry.sourceIndex;
        const rowValues = { ...(next[rowIndex] || {}) };
        rowValues[manualCol.fieldKey] = value;
        next[rowIndex] = rowValues;
      }
      return next;
    });
  };

  const mappingCompletion = allFields.filter((f) => mapping[f.key] !== null && mapping[f.key] !== undefined).length;
  const hasMappedPriceRealtime = useMemo(
    () =>
      Object.entries(mapping).some(
        ([key, value]) => (key === 'price' || /^price_\d+$/.test(key)) && typeof value === 'number',
      ),
    [mapping],
  );
  const hasManualPriceRealtime = useMemo(
    () =>
      Object.values(manualValuesByRow).some((rowValues) =>
        Object.entries(rowValues).some(
          ([key, value]) => (key === 'price' || /^price_\d+$/.test(key)) && String(value ?? '').trim() !== '',
        ),
      ),
    [manualValuesByRow],
  );
  const hasAnyPriceRealtime = hasMappedPriceRealtime || hasManualPriceRealtime;
  const effectiveManualSupplierName = useMemo(() => {
    const newName = manualSupplierNewName.trim();
    if (newName) return newName;
    return manualSupplierName.trim();
  }, [manualSupplierName, manualSupplierNewName]);
  const hasGlobalNewSupplier = manualSupplierNewName.trim().length > 0;
  const highlightPriceError = !!error && (error.includes('חובה למפות לפחות עמודת מחיר אחת') || error.includes('לא נמצאה עמודת מחיר ממופה'));
  const highlightManualColumnError = !!error && error.includes('נוספה עמודה ידנית שלא הוגדרה');
  const loadingView = useMemo(() => {
    const elapsedSeconds = loadingElapsedMs / 1000;
    const elapsed = formatElapsed(Math.floor(elapsedSeconds));

    if (loadingPhase === 'preview') {
      const isPdf = sourceType === 'pdf';
      // Tune perceived delay to ~3.5-4s before reaching near-complete.
      const targetSeconds = isPdf ? 4 : 3.5;
      const progress = Math.min(94, 8 + (elapsedSeconds / targetSeconds) * 86);
      return {
        title: isPdf ? 'מנתח PDF ומכין תצוגה מקדימה...' : 'טוען Excel/CSV ומכין תצוגה מקדימה...',
        hint: isPdf ? 'קבצי PDF יכולים לקחת יותר זמן. אפשר להמתין, התהליך רץ.' : 'קורא גיליון ובונה תצוגה מקדימה...',
        progress,
        elapsed,
      };
    }

    if (loadingPhase === 'validate') {
      const progress = Math.min(96, 10 + (elapsedSeconds / 3.8) * 86);
      return {
        title: 'בודק מיפוי שדות ושורות...',
        hint: 'מבצע ולידציה לפני ייבוא.',
        progress,
        elapsed,
      };
    }

    const progress = Math.min(98, 12 + (elapsedSeconds / 4) * 86);
    return {
      title: 'מייבא נתונים למערכת...',
      hint: 'שומר מוצרים ומחירים. נא להמתין לסיום.',
      progress,
      elapsed,
    };
  }, [loadingElapsedMs, loadingPhase, sourceType]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ייבוא נתונים (Wizard)</h1>
        <p className="text-sm text-muted-foreground">
          שלב {step}/4 - העלאה, Preview, מיפוי שדות, ולידציה וייבוא לפי Mapping בלבד.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {loading && loadingPhase ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{loadingView.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{loadingView.hint}</div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${loadingView.progress}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">זמן שחלף: {loadingView.elapsed}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>שלב 1 - העלאת קובץ</CardTitle>
          <CardDescription>בחר סוג קובץ ואז העלה את הקובץ המתאים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">סוג קובץ</Label>
            <div className="mt-2 inline-flex rounded-lg border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => {
                  setSourceType('excel');
                  setSourceTypeHint(null);
                  setFile(null);
                  setPreview(null);
                  setValidation(null);
                  setApplyResult(null);
                  setStep(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  sourceType === 'excel'
                    ? 'bg-emerald-100 text-emerald-900 shadow-sm ring-1 ring-emerald-300 dark:bg-emerald-900/35 dark:text-emerald-200'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                }`}
              >
                Excel / CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceType('pdf');
                  setSourceTypeHint(null);
                  setFile(null);
                  setPreview(null);
                  setValidation(null);
                  setApplyResult(null);
                  setStep(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  sourceType === 'pdf'
                    ? 'bg-sky-100 text-sky-900 shadow-sm ring-1 ring-sky-300 dark:bg-sky-900/35 dark:text-sky-200'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                }`}
              >
                PDF
              </button>
            </div>
          </div>
          <Label htmlFor="file-upload">בחר קובץ</Label>
          <Input
            key={`file-upload-${sourceType}`}
            id="file-upload"
            type="file"
            accept={sourceType === 'pdf' ? '.pdf' : '.csv,.xlsx,.xls'}
            onChange={handleFileSelect}
            disabled={loading}
            className="h-10 cursor-pointer text-sm transition-all duration-200 hover:border-primary/60 hover:bg-primary/5 file:ml-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary-foreground file:transition-transform file:duration-200 hover:file:scale-[1.02] hover:file:bg-primary/90 active:file:scale-[0.99]"
          />
          <div className="text-xs text-muted-foreground">
            {file ? `נבחר: ${file.name}` : 'לא נבחר קובץ עדיין'}
          </div>
          {sourceTypeHint ? <div className="text-xs text-primary">{sourceTypeHint}</div> : null}
        </CardContent>
      </Card>

      {preview && step >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>שלב 2 - Preview + Mapping</CardTitle>
            <CardDescription>מיפוי עמודות לשדות המערכת ותצוגה מקדימה לפני ייבוא</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs">סוג מקור</Label>
                <div className="mt-1 text-sm font-medium">{sourceType === 'pdf' ? 'PDF' : 'Excel / CSV'}</div>
              </div>

              {sourceType === 'pdf' ? (
                <div>
                  <Label className="text-xs">טבלה</Label>
                  <Select value={String(selectedPdfTableIndex)} onValueChange={(v) => selectPdfTable(Number(v))}>
                    <SelectTrigger className="mt-1 h-9 w-full text-xs">
                      <SelectValue placeholder="בחר טבלה..." />
                    </SelectTrigger>
                    <SelectContent className="w-[--radix-select-trigger-width]">
                      <SelectItem value="-1">כל הטבלאות יחד</SelectItem>
                      {(preview?.tables || []).map((table) => (
                        <SelectItem key={`pdf-table-${table.tableIndex}`} value={String(table.tableIndex)}>
                          {`טבלה ${table.tableIndex + 1} (עמוד ${table.pageStart})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {sourceType === 'pdf' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">מעמוד</Label>
                    <Input
                      value={pageFrom}
                      onChange={(e) => setPageFrom(e.target.value)}
                      inputMode="numeric"
                      className="mt-1 h-9 text-xs"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">עד עמוד</Label>
                    <Input
                      value={pageTo}
                      onChange={(e) => setPageTo(e.target.value)}
                      inputMode="numeric"
                      className="mt-1 h-9 text-xs"
                      placeholder="5"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={refreshPreview} disabled={loading}>
                רענן תצוגה
              </Button>
            </div>

            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              בחר מקור נתונים ורענן תצוגה לפני מיפוי.
            </div>

            {sourceType === 'pdf' && (preview?.tables || []).length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => selectPdfTable(-1)}
                  className={`rounded-lg border p-2 text-right text-xs transition-colors ${
                    selectedPdfTableIndex === -1 ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="font-semibold">כל הטבלאות יחד</div>
                  <div className="text-muted-foreground">
                    {(preview?.tables || []).reduce((sum, table) => sum + table.sampleRows.length, 0)} שורות דוגמה, תצוגה מאוחדת
                  </div>
                  <div className="mt-1 truncate text-muted-foreground">
                    המערכת מאחדת את כל הטבלאות ומדלגת על כותרות כפולות.
                  </div>
                </button>
                {(preview?.tables || []).map((table) => {
                  const active = table.tableIndex === selectedPdfTableIndex;
                  return (
                    <button
                      key={`pdf-table-card-${table.tableIndex}`}
                      type="button"
                      onClick={() => selectPdfTable(table.tableIndex)}
                      className={`rounded-lg border p-2 text-right text-xs transition-colors ${
                        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <div className="font-semibold">טבלה {table.tableIndex + 1} - עמוד {table.pageStart}</div>
                      <div className="text-muted-foreground">
                        {table.sampleRows.length} שורות דוגמה, {table.columns.length} עמודות
                      </div>
                      <div className="mt-1 truncate text-muted-foreground">
                        {String(table.sampleRows[0]?.[0] ?? '') || 'ללא תוכן תצוגה'}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <div className="font-semibold">איך משתמשים (מאוד פשוט):</div>
              <ol className="mt-2 list-decimal space-y-1 pr-5 text-muted-foreground">
                <li>מעל כל עמודה בוחרים מה היא: שם מוצר / מחיר / ספק / לא רלוונטי.</li>
                <li>אם עמודה לא רלוונטית, לחץ "הסר עמודה" והיא תיעלם מהדמיה.</li>
                <li>אם יש ספק אחד לכל הקובץ - סמן "ספק קבוע לכל הקובץ".</li>
                <li>סמן "הצג רק עמודות שסימנתי" כדי לראות בדיוק מה ייובא בפועל.</li>
              </ol>
              <div className="mt-2 text-xs text-muted-foreground">
                דוגמה: עמודה C = שם מוצר, עמודה H = מחיר, עמודה A = לא רלוונטי.
              </div>
            </div>
            {preview?.warnings && preview.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-100/30 p-3 text-xs text-amber-800 dark:text-amber-300">
                {preview.warnings.join(' | ')}
              </div>
            ) : null}

            <div className={`rounded-xl border p-3 ${highlightManualColumnError ? 'border-destructive' : ''}`}>
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={useManualSupplier}
                  onChange={(e) => {
                    setError(null);
                    const checked = e.target.checked;
                    setUseManualSupplier(checked);
                    if (!checked) {
                      setManualSupplierName('');
                      setManualSupplierNewName('');
                      return;
                    }
                    if (!manualSupplierName.trim() && supplierNames.length > 0) {
                      setManualSupplierName(supplierNames[0]);
                    }
                  }}
                />
                ספק קבוע לכל הקובץ
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <Label className={`text-xs ${hasGlobalNewSupplier ? 'text-muted-foreground' : ''}`}>ספק קיים</Label>
                  <Select
                    value={manualSupplierName}
                    onValueChange={(value) => {
                      setError(null);
                      setManualSupplierName(value);
                    }}
                    disabled={!useManualSupplier || supplierNames.length === 0 || hasGlobalNewSupplier}
                  >
                    <SelectTrigger className="mt-1 h-10 w-full">
                      <SelectValue placeholder="בחר ספק..." />
                    </SelectTrigger>

                    <SelectContent className="w-[--radix-select-trigger-width]">
                      {supplierNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {shortOptionLabel(name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                </div>
                <div>
                  <Label className="text-xs">הוסף ספק חדש (אופציונלי)</Label>
                  <Input
                    value={manualSupplierNewName}
                    onChange={(e) => {
                      setError(null);
                      setManualSupplierNewName(e.target.value);
                    }}
                    placeholder="לדוגמה: פרי חן"
                    disabled={!useManualSupplier}
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                אפשר לבחור ספק מהרשימה או להקליד ספק חדש.
                אם הוזן ספק חדש - הוא יקבל עדיפות, בחירת הספק הקיים תושבת, והוא ייווצר אוטומטית בזמן הייבוא.
                אם הוגדר ספק ידני ברמת שורה/עמודה למטה - הוא גובר על הספק הקבוע שמוגדר כאן.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showOnlyMapped}
                  onChange={(e) => setShowOnlyMapped(e.target.checked)}
                />
                הצג רק עמודות שסימנתי
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHiddenColumns([]);
                  setShowOnlyMapped(false);
                }}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                איפוס תצוגה
              </Button>
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">עמודות ידניות</div>
                <Button type="button" size="sm" variant="outline" onClick={addManualColumn}>
                  הוסף עמודה ידנית
                </Button>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                אפשר לבחור כל שדה (ספק, מחיר, כמות באריזה ועוד) ולהקליד ערך ידני לכל שורה.
              </div>
            </div>

            {hiddenColumnDefs.length > 0 ? (
              <div className="rounded-lg border p-2">
                <div className="mb-2 text-xs text-muted-foreground">עמודות שהוסתרו:</div>
                <div className="flex flex-wrap gap-2">
                  {hiddenColumnDefs.map((col) => (
                    <button
                      key={`hidden-col-${col.index}`}
                      type="button"
                      onClick={() => handleRestoreColumn(col.index)}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                    >
                      {col.letter}
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {hiddenRows.length > 0 ? (
              <div className="rounded-lg border p-2">
                <div className="mb-2 text-xs text-muted-foreground">שורות שהוסתרו (לא ייובאו):</div>
                <div className="flex flex-wrap gap-2">
                  {[...hiddenRows].sort((a, b) => a - b).map((rowIndex) => (
                    <button
                      key={`hidden-row-${rowIndex}`}
                      type="button"
                      onClick={() => handleRestoreRow(rowIndex)}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                    >
                      שורה {rowIndex + 1}
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              ref={previewTableScrollRef}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onPointerCancel={handlePreviewPointerUp}
              className={`overflow-x-auto rounded-xl border ${
                highlightPriceError || highlightManualColumnError ? 'border-destructive' : ''
              } ${isPreviewDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
              style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
            >
              <table className="min-w-max table-auto text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr>
                    <th className="sticky right-0 z-10 min-w-[56px] bg-muted px-2 py-2 text-right">#</th>
                    {manualColumns.map((manualCol) => (
                      <th key={manualCol.id} className="min-w-[140px] border-r px-2 py-2 text-right align-top sm:min-w-[170px]">
                        <div className="text-[11px] text-muted-foreground">ידני</div>
                        <Select
                          value={manualCol.fieldKey || SELECT_NONE_VALUE}
                          onValueChange={(v) => updateManualColumnField(manualCol.id, v === SELECT_NONE_VALUE ? '' : v)}
                        >
                          <SelectTrigger
                            className={`mt-1 h-8 w-[42vw] max-w-[150px] text-xs sm:w-full sm:max-w-none ${
                              highlightManualColumnError && !manualCol.fieldKey ? 'border-destructive' : ''
                            }`}
                          >
                            <SelectValue placeholder="לא הוגדר" />
                          </SelectTrigger>
                          <SelectContent className="w-[--radix-select-trigger-width]">
                            <SelectItem value={SELECT_NONE_VALUE}>לא הוגדר</SelectItem>
                            {allFields.map((field) => {
                              const usedByAnother = manualColumns.some((c) => c.id !== manualCol.id && c.fieldKey === field.key);
                              return (
                                <SelectItem key={field.key} value={field.key} disabled={usedByAnother}>
                                  {field.shortLabel || field.label}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeManualColumn(manualCol.id)}
                          className="mt-1 h-7 px-2 text-xs text-muted-foreground"
                        >
                          <X className="ml-1 h-3 w-3" />
                          הסר
                        </Button>
                        {isPresetValueFieldKey(manualCol.fieldKey) ? (
                          <div className="mt-1 space-y-1">
                            {(() => {
                              const options = isSupplierFieldKey(manualCol.fieldKey)
                                ? supplierNames
                                : isCategoryFieldKey(manualCol.fieldKey)
                                  ? categoryNames
                                  : isPricingUnitFieldKey(manualCol.fieldKey)
                                    ? pricingUnitOptions
                                    : packageTypeOptions;
                              const currentValue = manualBulkValueByColumnId[manualCol.id] || '';
                              const hasKnownOption = isValueFromKnownOptions(currentValue, options);
                              const selectValue = hasKnownOption ? currentValue : SELECT_NONE_VALUE;
                              const inputValue = hasKnownOption ? '' : currentValue;
                              const existingPlaceholder = isSupplierFieldKey(manualCol.fieldKey)
                                ? 'בחר ספק קיים...'
                                : isCategoryFieldKey(manualCol.fieldKey)
                                  ? 'בחר קטגוריה קיימת...'
                                  : isPricingUnitFieldKey(manualCol.fieldKey)
                                    ? 'בחר סוג יחידה...'
                                    : 'בחר סוג אריזה...';
                              const newValuePlaceholder = isSupplierFieldKey(manualCol.fieldKey)
                                ? 'או הקלד ספק חדש...'
                                : isCategoryFieldKey(manualCol.fieldKey)
                                  ? 'או הקלד קטגוריה חדשה...'
                                  : isPricingUnitFieldKey(manualCol.fieldKey)
                                    ? 'או הקלד סוג יחידה...'
                                    : 'או הקלד סוג אריזה...';
                              return (
                                <>
                                  <Select
                                    value={selectValue}
                                    onValueChange={(v) =>
                                      setManualBulkValueByColumnId((prev) => ({
                                        ...prev,
                                        [manualCol.id]: v === SELECT_NONE_VALUE ? '' : v,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-8 w-full text-xs" disabled={!manualCol.fieldKey}>
                                      <SelectValue placeholder={existingPlaceholder} />
                                    </SelectTrigger>
                                    <SelectContent className="w-[--radix-select-trigger-width]">
                                      <SelectItem value={SELECT_NONE_VALUE}>{existingPlaceholder}</SelectItem>
                                      {options.map((name) => (
                                        <SelectItem key={`${manualCol.id}-bulk-${name}`} value={name}>
                                          {formatPresetOptionLabel(manualCol.fieldKey, name)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={inputValue}
                                    onChange={(e) =>
                                      setManualBulkValueByColumnId((prev) => ({
                                        ...prev,
                                        [manualCol.id]: e.target.value,
                                      }))
                                    }
                                    placeholder={newValuePlaceholder}
                                    className="h-8 text-xs"
                                    disabled={!manualCol.fieldKey}
                                  />
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <Input
                            value={manualBulkValueByColumnId[manualCol.id] || ''}
                            onChange={(e) =>
                              setManualBulkValueByColumnId((prev) => ({
                                ...prev,
                                [manualCol.id]: e.target.value,
                              }))
                            }
                            placeholder={manualCol.fieldKey ? 'ערך לכל השורות' : 'בחר שדה קודם'}
                            className="mt-1 h-8 text-xs"
                            disabled={!manualCol.fieldKey}
                          />
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => applyManualColumnValueToAllRows(manualCol.id)}
                          className="mt-1 h-7 px-2 text-xs"
                        >
                          החל על כל השורות
                        </Button>
                      </th>
                    ))}
                    {visibleColumns.map((col) => (
                      <th
                        key={col.index}
                        className="border-r px-2 py-2 text-right align-top"
                        style={{ width: columnWidths.get(col.index) }}
                      >
                        <Select
                          value={mappedByColumn.get(col.index) || SELECT_NONE_VALUE}
                          onValueChange={(v) => handleColumnFieldChange(col.index, v === SELECT_NONE_VALUE ? '' : v)}
                        >
                          <SelectTrigger
                            className={`mt-2 h-9 w-[42vw] max-w-[160px] text-xs sm:w-full sm:max-w-none ${
                              highlightPriceError ? 'border-destructive' : ''
                            }`}
                          >
                            <SelectValue placeholder="לא רלוונטי" />
                          </SelectTrigger>
                          <SelectContent className="w-[--radix-select-trigger-width]">
                            <SelectItem value={SELECT_NONE_VALUE}>לא רלוונטי</SelectItem>
                            {allFields.map((field) => {
                              const usedBy = mapping[field.key];
                              const usedByAutoHidden =
                                typeof usedBy === 'number' &&
                                (autoHiddenEmptySet.has(usedBy) || autoHiddenDerivedSet.has(usedBy));
                              const disabled = typeof usedBy === 'number' && usedBy !== col.index && !usedByAutoHidden;
                              return (
                                <SelectItem key={field.key} value={field.key} disabled={disabled}>
                                  {field.shortLabel || field.label}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleHideColumn(col.index)}
                          className="mt-2 block h-7 px-2 text-xs text-muted-foreground"
                        >
                          <X className="ml-1 h-3 w-3" />
                          הסר עמודה
                        </Button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleColumns.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        אין עמודות להצגה. בטל "הצג רק עמודות שסימנתי" או החזר עמודות שהוסתרו.
                      </td>
                    </tr>
                  ) : visiblePreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + manualColumns.length + 1} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        אין שורות להצגה. החזר שורות שהסתרת כדי להמשיך.
                      </td>
                    </tr>
                  ) : (
                    visiblePreviewRows.map(({ row, sourceIndex }) => (
                      <tr key={`row-${sourceIndex}`} className="border-t">
                        <td className="sticky right-0 z-10 bg-background px-2 py-1 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between gap-1">
                            <span>{sourceIndex + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleHideRow(sourceIndex)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                              title="הסר שורה"
                              aria-label={`הסר שורה ${sourceIndex + 1}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        {manualColumns.map((manualCol) => (
                          <td key={`manual-${manualCol.id}-${sourceIndex}`} className="border-r px-2 py-1 align-top">
                            {isPresetValueFieldKey(manualCol.fieldKey) ? (
                              <div className="space-y-1">
                                {(() => {
                                  const options = isSupplierFieldKey(manualCol.fieldKey)
                                    ? supplierNames
                                    : isCategoryFieldKey(manualCol.fieldKey)
                                      ? categoryNames
                                      : isPricingUnitFieldKey(manualCol.fieldKey)
                                        ? pricingUnitOptions
                                        : packageTypeOptions;
                                  const currentValue = manualValuesByRow[sourceIndex]?.[manualCol.fieldKey] || '';
                                  const hasKnownOption = isValueFromKnownOptions(currentValue, options);
                                  const selectValue = hasKnownOption ? currentValue : SELECT_NONE_VALUE;
                                  const inputValue = hasKnownOption ? '' : currentValue;
                                  const existingPlaceholder = isSupplierFieldKey(manualCol.fieldKey)
                                    ? 'בחר ספק קיים...'
                                    : isCategoryFieldKey(manualCol.fieldKey)
                                      ? 'בחר קטגוריה קיימת...'
                                      : isPricingUnitFieldKey(manualCol.fieldKey)
                                        ? 'בחר סוג יחידה...'
                                        : 'בחר סוג אריזה...';
                                  const newValuePlaceholder = isSupplierFieldKey(manualCol.fieldKey)
                                    ? 'או הקלד ספק חדש...'
                                    : isCategoryFieldKey(manualCol.fieldKey)
                                      ? 'או הקלד קטגוריה חדשה...'
                                      : isPricingUnitFieldKey(manualCol.fieldKey)
                                        ? 'או הקלד סוג יחידה...'
                                        : 'או הקלד סוג אריזה...';
                                  return (
                                    <>
                                      <Select
                                        value={selectValue}
                                        onValueChange={(v) =>
                                          handleManualValueChange(
                                            sourceIndex,
                                            manualCol.fieldKey,
                                            v === SELECT_NONE_VALUE ? '' : v,
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-8 w-full text-xs" disabled={!manualCol.fieldKey}>
                                          <SelectValue placeholder={existingPlaceholder} />
                                        </SelectTrigger>
                                        <SelectContent className="w-[--radix-select-trigger-width]">
                                          <SelectItem value={SELECT_NONE_VALUE}>{existingPlaceholder}</SelectItem>
                                          {options.map((name) => (
                                            <SelectItem key={`${manualCol.id}-${sourceIndex}-${name}`} value={name}>
                                              {formatPresetOptionLabel(manualCol.fieldKey, name)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        value={inputValue}
                                        onChange={(e) => handleManualValueChange(sourceIndex, manualCol.fieldKey, e.target.value)}
                                        placeholder={newValuePlaceholder}
                                        className="h-8 text-xs"
                                        disabled={!manualCol.fieldKey}
                                      />
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <Input
                                value={manualValuesByRow[sourceIndex]?.[manualCol.fieldKey] || ''}
                                onChange={(e) => handleManualValueChange(sourceIndex, manualCol.fieldKey, e.target.value)}
                                placeholder={manualCol.fieldKey ? 'ערך ידני' : 'בחר שדה קודם'}
                                className="h-8 text-xs"
                                disabled={!manualCol.fieldKey}
                              />
                            )}
                          </td>
                        ))}
                        {visibleColumns.map((col) => (
                          <td
                            key={`cell-${sourceIndex}-${col.index}`}
                            className="border-r px-2 py-1 align-top whitespace-nowrap"
                            style={{ width: columnWidths.get(col.index) }}
                            title={String(row[col.index] ?? '')}
                          >
                            {(() => {
                              const mappedFieldKey = mappedByColumn.get(col.index) || '';
                              const rowOverrides = manualValuesByRow[sourceIndex];
                              const hasOverride = !!(mappedFieldKey && rowOverrides && Object.prototype.hasOwnProperty.call(rowOverrides, mappedFieldKey));
                              const manualOverride = mappedFieldKey ? rowOverrides?.[mappedFieldKey] : undefined;
                              const rawValue = manualOverride ?? row[col.index] ?? '';
                              const value = String(rawValue);
                              if (mappedFieldKey) {
                                return (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      value={value}
                                      onChange={(e) => handleMappedCellValueChange(sourceIndex, col.index, e.target.value)}
                                      placeholder="ערוך ערך"
                                      className="h-8 text-xs"
                                    />
                                    {hasOverride ? (
                                      <button
                                        type="button"
                                        onClick={() => clearMappedCellOverride(sourceIndex, mappedFieldKey)}
                                        className="shrink-0 rounded border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                                        title="שחזר ערך מקורי"
                                      >
                                        שחזר
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              }
                              return value;
                            })()}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div>
                מציג שורות {visiblePreviewRows.length > 0 ? `${sampleRowOffset + 1}-${sampleRowOffset + visiblePreviewRows.length}` : '0'} מתוך{' '}
                {previewTotalRows}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void goToPreviewPage(previewPage - 1)}
                  disabled={loading || previewPage <= 1}
                >
                  קודם
                </Button>
                <span>
                  עמוד {previewPage} מתוך {previewTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void goToPreviewPage(previewPage + 1)}
                  disabled={loading || previewPage >= previewTotalPages}
                >
                  הבא
                </Button>
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="mt-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                שדות שמופו: {mappingCompletion} מתוך {allFields.length}. דוגמה: {columnMap.get(mapping.product_name ?? -1) || 'לא מופתה עמודת מוצר'}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button onClick={handleValidate} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Validate Mapping
              </Button>
            </div>
            <div
              className={`text-xs ${
                hasAnyPriceRealtime ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'
              }`}
            >
              {hasAnyPriceRealtime
                ? '✅ יש מחיר ממופה (או מחיר ידני) - אפשר להמשיך ל-Validate'
                : '❌ אין מחיר ממופה כרגע - יש למפות עמודת מחיר או להזין מחיר ידני'}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {validation && step >= 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>שלב 3 - תוצאות ולידציה</CardTitle>
            <CardDescription>בדיקת required fields ושגיאות פר שורה לפני Apply</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted p-3 text-sm">שורות מקור: {validation.statsEstimate.totalInputRows}</div>
              <div className="rounded-lg bg-muted p-3 text-sm">שורות ממופות: {validation.statsEstimate.mappedRows}</div>
              <div className="rounded-lg bg-muted p-3 text-sm">שורות שדולגו: {validation.statsEstimate.skippedRows}</div>
            </div>

            {validation.fieldErrors.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
                <div className="font-semibold">שגיאות כלליות</div>
                <ul className="mt-2 list-disc space-y-1 pr-5">
                  {validation.fieldErrors.map((msg, idx) => (
                    <li key={`field-err-${idx}`}>{msg}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/40 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                המיפוי עבר בדיקות כלליות.
              </div>
            )}

            {validation.rowErrors.length > 0 ? (
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-semibold">שגיאות שורות</div>
                <div className="max-h-56 overflow-auto space-y-1 text-xs">
                  {validation.rowErrors.map((err, idx) => (
                    <div key={`row-err-${idx}`} className="rounded bg-muted px-2 py-1">
                      שורה {err.row}: {err.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {Array.isArray(validation.unimportedProducts) && validation.unimportedProducts.length > 0 ? (
              <div className="rounded-lg border border-amber-300/60 p-3">
                <div className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  מוצרים שלא ייובאו ({validation.unimportedProducts.length})
                </div>
                <div className="max-h-56 overflow-auto space-y-1 text-xs">
                  {validation.unimportedProducts.map((item, idx) => (
                    <div key={`unimported-${idx}`} className="rounded bg-amber-50 px-2 py-1 dark:bg-amber-950/30">
                      שורה {item.row}: {item.productName || '(ללא שם מוצר)'} — {item.reason}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                חזור למיפוי
              </Button>
              <Button onClick={() => setStep(4)}>
                המשך ל-Apply
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>שלב 4 - Apply Import</CardTitle>
            <CardDescription>הייבוא משתמש רק במיפוי שהוגדר (ללא ניחוש אוטומטי)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>מצב ייבוא</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
                <SelectTrigger className="mt-1 h-10 w-full text-sm">
                  <SelectValue placeholder="בחר מצב ייבוא" />
                </SelectTrigger>
                <SelectContent className="w-[--radix-select-trigger-width]">
                  <SelectItem value="merge">Merge (הוסף/עדכן)</SelectItem>
                  <SelectItem value="overwrite">Overwrite (מחק וייבא מחדש)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'overwrite' ? (
              <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                <Label htmlFor="overwrite-confirm">הקלד DELETE לאישור</Label>
                <Input
                  id="overwrite-confirm"
                  value={overwriteConfirm}
                  onChange={(e) => setOverwriteConfirm(e.target.value)}
                  placeholder="DELETE"
                />
              </div>
            ) : null}

            <Button onClick={handleApply} disabled={loading || (mode === 'overwrite' && overwriteConfirm !== 'DELETE')}>
              {loading ? 'מייבא...' : 'Apply Import'}
            </Button>

            {applyResult ? (
              <div className="rounded-lg border p-3 text-sm">
                <div className="font-semibold mb-2">תוצאות ייבוא</div>
                <div>ספקים שנוצרו: {applyResult.stats.suppliersCreated}</div>
                <div>קטגוריות שנוצרו: {applyResult.stats.categoriesCreated}</div>
                <div>מוצרים שנוצרו: {applyResult.stats.productsCreated}</div>
                <div>מחירים שנוספו: {applyResult.stats.pricesInserted}</div>
                <div>מחירים שדולגו: {applyResult.stats.pricesSkipped}</div>
                {applyResult.importDiagnostics ? (
                  <div className="mt-2 rounded border bg-muted/30 p-2 text-xs">
                    <div>שורות לפני Ignore: {applyResult.importDiagnostics.rowsBeforeIgnored}</div>
                    <div>שורות שדולגו ב-Ignored: {applyResult.importDiagnostics.ignoredRowsCount}</div>
                    <div>שורות מקור: {applyResult.importDiagnostics.sourceRows}</div>
                    <div>שורות שעברו מיפוי: {applyResult.importDiagnostics.mappedRowsBeforeDedupe}</div>
                    <div>שורות אחרי הסרת כפילויות: {applyResult.importDiagnostics.rowsAfterDedupe}</div>
                    <div>נפלו בולידציה: {applyResult.importDiagnostics.droppedInValidation}</div>
                    <div>נפלו ככפילויות: {applyResult.importDiagnostics.droppedAsDuplicates}</div>
                  </div>
                ) : null}
                {Array.isArray(applyResult.unimportedProducts) && applyResult.unimportedProducts.length > 0 ? (
                  <div className="mt-3 rounded border border-amber-300/60 p-2">
                    <div className="mb-1 font-semibold text-amber-700 dark:text-amber-300">
                      מוצרים שלא ייובאו ({applyResult.unimportedProducts.length})
                    </div>
                    <div className="max-h-40 overflow-auto space-y-1 text-xs">
                      {applyResult.unimportedProducts.map((item, idx) => (
                        <div key={`apply-unimported-${idx}`} className="rounded bg-amber-50 px-2 py-1 dark:bg-amber-950/30">
                          שורה {item.row}: {item.productName || '(ללא שם מוצר)'} — {item.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center pointer-events-none">
          <div className="mb-6 rounded-full border bg-background px-4 py-2 text-sm shadow-lg">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              מעבד ייבוא...
            </span>
          </div>
        </div>
      ) : null}

      {!currentTenant ? (
        <div className="text-xs text-muted-foreground">נדרש tenant פעיל כדי לייבא.</div>
      ) : null}
    </div>
  );
}
