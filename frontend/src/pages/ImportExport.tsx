import { useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '../hooks/useTenant';
import { useSuppliers } from '../hooks/useSuppliers';
import {
  importApi,
  type ImportApplyResponse,
  type ImportMapping,
  type ImportPreviewResponse,
  type ImportValidateResponse,
} from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, RotateCcw, Upload, X } from 'lucide-react';

type WizardStep = 1 | 2 | 3 | 4;
type ImportMode = 'merge' | 'overwrite';

type MappingField = {
  key: string;
  label: string;
  help: string;
  required?: boolean;
};
type ManualColumn = {
  id: string;
  fieldKey: string;
};

const baseFields: MappingField[] = [
  { key: 'product_name', label: 'שם מוצר', help: 'שדה חובה', required: true },
  { key: 'sku', label: 'מק"ט', help: 'אופציונלי' },
  { key: 'barcode', label: 'ברקוד', help: 'אופציונלי' },
  { key: 'category', label: 'קטגוריה', help: 'ברירת מחדל: כללי' },
  { key: 'package_quantity', label: 'כמות באריזה', help: 'מספר חיובי או ריק' },
  { key: 'vat', label: 'מע"מ', help: 'אופציונלי' },
  { key: 'currency', label: 'מטבע', help: 'אופציונלי' },
];

function getPairFields(pairCount: number): MappingField[] {
  const out: MappingField[] = [];
  for (let i = 1; i <= pairCount; i += 1) {
    out.push({ key: `supplier_${i}`, label: `ספק ${i}`, help: 'לזוג ספק/מחיר' });
    out.push({ key: `price_${i}`, label: `מחיר ${i}`, help: 'חייב להיות > 0' });
    out.push({ key: `discount_percent_${i}`, label: `הנחה ${i}`, help: 'אופציונלי 0-100' });
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

export default function ImportExport() {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const { data: suppliers = [] } = useSuppliers();

  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [hasHeader, setHasHeader] = useState(false);

  const [pairCount, setPairCount] = useState(3);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [hiddenColumns, setHiddenColumns] = useState<number[]>([]);
  const [hiddenRows, setHiddenRows] = useState<number[]>([]);
  const [showOnlyMapped, setShowOnlyMapped] = useState(false);
  const [manualColumns, setManualColumns] = useState<ManualColumn[]>([]);
  const [manualValuesByRow, setManualValuesByRow] = useState<Record<number, Record<string, string>>>({});
  const [manualBulkValueByColumnId, setManualBulkValueByColumnId] = useState<Record<string, string>>({});
  const [useManualSupplier, setUseManualSupplier] = useState(false);
  const [manualSupplierName, setManualSupplierName] = useState('');

  const [validation, setValidation] = useState<ImportValidateResponse | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [overwriteConfirm, setOverwriteConfirm] = useState('');
  const [applyResult, setApplyResult] = useState<ImportApplyResponse | null>(null);

  const allFields = useMemo<MappingField[]>(() => [...baseFields, ...getPairFields(pairCount)], [pairCount]);
  const fieldLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    allFields.forEach((f) => map.set(f.key, f.label));
    return map;
  }, [allFields]);

  const columnMap = useMemo(() => {
    const map = new Map<number, string>();
    preview?.columns.forEach((col) => map.set(col.index, `${col.letter} ${col.headerValue ? `- ${col.headerValue}` : ''}`));
    return map;
  }, [preview]);
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
    if (!preview) return new Set<number>();
    const isEmptyCell = (value: unknown) => String(value ?? '').trim() === '';
    const set = new Set<number>();

    for (const col of preview.columns) {
      if (mappedByColumn.has(col.index)) continue;
      const headerEmpty = String(col.headerValue ?? '').trim() === '';
      const allSampleCellsEmpty = preview.sampleRows.every((row) => isEmptyCell(row[col.index]));
      if (headerEmpty && allSampleCellsEmpty) {
        set.add(col.index);
      }
    }

    return set;
  }, [preview, mappedByColumn]);
  const mappedVisibleSet = useMemo(() => new Set<number>([...mappedByColumn.keys()].filter((idx) => !hiddenSet.has(idx))), [mappedByColumn, hiddenSet]);
  const visibleColumns = useMemo(() => {
    if (!preview) return [];
    const base = preview.columns.filter((col) => !hiddenSet.has(col.index) && !autoHiddenEmptySet.has(col.index));
    if (!showOnlyMapped || mappedVisibleSet.size === 0) return base;
    return base.filter((col) => mappedVisibleSet.has(col.index));
  }, [preview, hiddenSet, autoHiddenEmptySet, showOnlyMapped, mappedVisibleSet]);
  const hiddenColumnDefs = useMemo(
    () => (preview?.columns || []).filter((col) => hiddenSet.has(col.index)),
    [preview, hiddenSet],
  );
  const autoHiddenEmptyColumns = useMemo(
    () => (preview?.columns || []).filter((col) => autoHiddenEmptySet.has(col.index)),
    [preview, autoHiddenEmptySet],
  );
  const previewRows = useMemo(
    () => (preview?.sampleRows || []).map((row, sourceIndex) => ({ row, sourceIndex })),
    [preview],
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
      let maxLen = Math.max(6, calcLen(col.letter), calcLen(col.headerValue), calcLen(mappedFieldLabel));

      for (const { row } of visiblePreviewRows.slice(0, 30)) {
        maxLen = Math.max(maxLen, calcLen(row[col.index]));
      }

      // Keep columns readable, but avoid huge empty width for short values.
      const px = Math.max(110, Math.min(360, 32 + maxLen * 8));
      widths.set(col.index, `${px}px`);
    }

    return widths;
  }, [visibleColumns, mappedByColumn, fieldLabelMap, visiblePreviewRows]);

  const startPreview = async (selectedFile: File, opts?: { sheetIndex?: number; hasHeader?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await importApi.preview(selectedFile, opts);
      setPreview(result);
      setSheetIndex(result.selectedSheet);
      setHasHeader(result.hasHeader);

      const inferredPairs = inferPairCount(result.suggestedMapping || {});
      const nextPairCount = Math.max(3, inferredPairs);
      setPairCount(nextPairCount);
      setMapping(normalizeMappingForUi(result.suggestedMapping || {}));
      setHiddenColumns([]);
      setHiddenRows([]);
      setManualColumns([]);
      setManualValuesByRow({});
      setManualBulkValueByColumnId({});
      setShowOnlyMapped(false);

      setStep(2);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'שגיאה בתצוגה מקדימה'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setValidation(null);
    setApplyResult(null);
    await startPreview(selectedFile, { sheetIndex: 0, hasHeader: false });
  };

  const handleValidate = async () => {
    if (!file || !preview) return;
    if (useManualSupplier && !manualSupplierName.trim()) {
      setError('בחר או הקלד שם ספק קבוע לפני Validate');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await importApi.validateMapping(file, {
        sheetIndex,
        hasHeader,
        mapping,
        ignoredRows: hiddenRows,
        manualSupplierName: useManualSupplier ? manualSupplierName : undefined,
        manualValuesByRow: Object.keys(manualValuesByRow).length > 0 ? manualValuesByRow : undefined,
      });
      setValidation(result);
      setStep(3);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'שגיאה בבדיקת המיפוי'));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!file) return;
    if (useManualSupplier && !manualSupplierName.trim()) {
      setError('בחר או הקלד שם ספק קבוע לפני Apply');
      return;
    }
    if (mode === 'overwrite' && overwriteConfirm !== 'DELETE') {
      setError('במצב החלפה יש להקליד DELETE');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await importApi.apply(file, {
        mode,
        sheetIndex,
        hasHeader,
        mapping,
        ignoredRows: hiddenRows,
        manualSupplierName: useManualSupplier ? manualSupplierName : undefined,
        manualValuesByRow: Object.keys(manualValuesByRow).length > 0 ? manualValuesByRow : undefined,
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
    const trimmed = value.trim();
    setManualValuesByRow((prev) => {
      const next = { ...prev };
      const rowValues = { ...(next[rowIndex] || {}) };
      if (!trimmed) {
        delete rowValues[fieldKey];
      } else {
        rowValues[fieldKey] = trimmed;
      }

      if (Object.keys(rowValues).length === 0) {
        delete next[rowIndex];
      } else {
        next[rowIndex] = rowValues;
      }

      return next;
    });
  };

  const addManualColumn = () => {
    const used = new Set(manualColumns.map((c) => c.fieldKey));
    const firstAvailable = allFields.find((f) => !used.has(f.key))?.key || allFields[0]?.key;
    if (!firstAvailable) return;
    setManualColumns((prev) => [...prev, { id: createManualColumnId(), fieldKey: firstAvailable }]);
  };

  const updateManualColumnField = (columnId: string, nextFieldKey: string) => {
    setManualColumns((prev) => {
      const current = prev.find((c) => c.id === columnId);
      if (!current || current.fieldKey === nextFieldKey) return prev;

      setManualValuesByRow((oldRows) => {
        const nextRows: Record<number, Record<string, string>> = {};
        Object.entries(oldRows).forEach(([rowIndex, values]) => {
          const row = { ...values };
          const movedValue = row[current.fieldKey];
          delete row[current.fieldKey];
          if (movedValue && !row[nextFieldKey]) {
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
    if (!manualCol) return;
    const value = (manualBulkValueByColumnId[columnId] || '').trim();
    if (!value) return;

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

      <Card>
        <CardHeader>
          <CardTitle>שלב 1 - העלאת קובץ</CardTitle>
          <CardDescription>תומך ב-CSV / XLS / XLSX</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="file-upload">בחר קובץ</Label>
          <Input
            id="file-upload"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            disabled={loading}
            className="h-10 cursor-pointer text-sm transition-all duration-200 hover:border-primary/60 hover:bg-primary/5 file:ml-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary-foreground file:transition-transform file:duration-200 hover:file:scale-[1.02] hover:file:bg-primary/90 active:file:scale-[0.99]"
          />
          <div className="text-xs text-muted-foreground">
            {file ? `נבחר: ${file.name}` : 'לא נבחר קובץ עדיין'}
          </div>
        </CardContent>
      </Card>

      {preview && step >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>שלב 2 - Preview + Mapping</CardTitle>
            <CardDescription>מיפוי עמודות לשדות המערכת ותצוגה מקדימה לפני ייבוא</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              המערכת משתמשת אוטומטית בגיליון הראשון בקובץ ומניחה שאין כותרת בשורה הראשונה.
            </div>

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

            <div className="rounded-xl border p-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={useManualSupplier}
                  onChange={(e) => setUseManualSupplier(e.target.checked)}
                />
                ספק קבוע לכל הקובץ
              </label>
              <div className="mt-2">
                <Input
                  value={manualSupplierName}
                  onChange={(e) => setManualSupplierName(e.target.value)}
                  placeholder="לדוגמה: פרי חן"
                  list="import-suppliers-list"
                  disabled={!useManualSupplier}
                />
                <datalist id="import-suppliers-list">
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.name} />
                  ))}
                </datalist>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                מתאים לקבצים שבהם כל השורות מאותו ספק. אפשר לבחור ספק קיים או להקליד חדש.
                אם הספק לא קיים - הוא ייווצר אוטומטית בזמן הייבוא.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
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
            {autoHiddenEmptyColumns.length > 0 ? (
              <div className="rounded-lg border p-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  עמודות ריקות הוסתרו אוטומטית:
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {autoHiddenEmptyColumns.map((col) => (
                    <span key={`auto-empty-${col.index}`} className="rounded-full border px-2 py-1">
                      {col.letter}
                    </span>
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

            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-max table-auto text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr>
                    <th className="sticky right-0 z-10 min-w-[56px] bg-muted px-2 py-2 text-right">#</th>
                    {manualColumns.map((manualCol) => (
                      <th key={manualCol.id} className="min-w-[170px] border-r px-2 py-2 text-right align-top">
                        <div className="text-[11px] text-muted-foreground">ידני</div>
                        <select
                          className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          value={manualCol.fieldKey}
                          onChange={(e) => updateManualColumnField(manualCol.id, e.target.value)}
                        >
                          {allFields.map((field) => {
                            const usedByAnother = manualColumns.some((c) => c.id !== manualCol.id && c.fieldKey === field.key);
                            return (
                              <option key={field.key} value={field.key} disabled={usedByAnother}>
                                {field.label}
                              </option>
                            );
                          })}
                        </select>
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
                        <Input
                          value={manualBulkValueByColumnId[manualCol.id] || ''}
                          onChange={(e) =>
                            setManualBulkValueByColumnId((prev) => ({
                              ...prev,
                              [manualCol.id]: e.target.value,
                            }))
                          }
                          placeholder="ערך לכל השורות"
                          className="mt-1 h-8 text-xs"
                        />
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
                        <div className="text-[11px] text-muted-foreground">{col.letter}</div>
                        <div className="font-semibold">{fieldLabelMap.get(mappedByColumn.get(col.index) || '') || '-'}</div>
                        <div className="text-xs text-muted-foreground truncate">{col.headerValue || '-'}</div>
                        <select
                          className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                          value={mappedByColumn.get(col.index) || ''}
                          onChange={(e) => handleColumnFieldChange(col.index, e.target.value)}
                        >
                          <option value="">לא רלוונטי (לא ייובא)</option>
                          {allFields.map((field) => {
                            const usedBy = mapping[field.key];
                            const disabled = typeof usedBy === 'number' && usedBy !== col.index;
                            return (
                              <option key={field.key} value={field.key} disabled={disabled}>
                                {field.label}
                              </option>
                            );
                          })}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleHideColumn(col.index)}
                          className="mt-2 h-7 px-2 text-xs text-muted-foreground"
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
                            <Input
                              value={manualValuesByRow[sourceIndex]?.[manualCol.fieldKey] || ''}
                              onChange={(e) => handleManualValueChange(sourceIndex, manualCol.fieldKey, e.target.value)}
                              placeholder="ערך ידני"
                              className="h-8 text-xs"
                            />
                          </td>
                        ))}
                        {visibleColumns.map((col) => (
                          <td
                            key={`cell-${sourceIndex}-${col.index}`}
                            className="border-r px-2 py-1 align-top whitespace-nowrap"
                            style={{ width: columnWidths.get(col.index) }}
                            title={String(row[col.index] ?? '')}
                          >
                            {String(row[col.index] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
                <div className="mb-2 text-sm font-semibold">שגיאות שורות (עד 50)</div>
                <div className="max-h-56 overflow-auto space-y-1 text-xs">
                  {validation.rowErrors.map((err, idx) => (
                    <div key={`row-err-${idx}`} className="rounded bg-muted px-2 py-1">
                      שורה {err.row}: {err.message}
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
              <select
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value as ImportMode)}
              >
                <option value="merge">Merge (הוסף/עדכן)</option>
                <option value="overwrite">Overwrite (מחק וייבא מחדש)</option>
              </select>
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
