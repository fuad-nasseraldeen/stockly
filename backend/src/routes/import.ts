import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { normalizeName } from '../lib/normalize.js';
import { calcSellPrice, calcCostAfterDiscount } from '../lib/pricing.js';
import { extractPdfTablesWithTextract } from '../import/extractors/pdfExtractor.js';

const router = Router();
const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PREVIEW_PAGES = 10;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMPORT_FILE_BYTES,
  },
});

const importModeSchema = z.enum(['merge', 'overwrite']);
const importSourceTypeSchema = z.enum(['excel', 'pdf']);

type MappingValue = number | null;
type Mapping = Record<string, MappingValue>;

interface ImportRow {
  product_name: string;
  supplier: string;
  price: number;
  category?: string;
  sku?: string;
  barcode?: string;
  package_quantity?: number;
  discount_percent?: number;
  vat?: number;
  currency?: string;
}

interface RowError {
  row: number;
  message: string;
}

const mappingSaveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mapping: z.record(z.string(), z.union([z.number().int().min(0), z.null()])),
  source_type: z.enum(['excel', 'pdf']).optional(),
  template_key: z.string().trim().max(255).optional(),
});

const IMPORT_MAPPINGS_PREF_KEY = 'import_saved_mappings_v1';

type SavedImportMappingRow = {
  id: string;
  name: string;
  mapping_json: Mapping;
  source_type?: 'excel' | 'pdf';
  template_key?: string | null;
  created_at: string;
  updated_at: string;
};

function isMissingImportMappingsTable(error: any): boolean {
  return error?.code === 'PGRST205' && String(error?.message || '').includes('import_mappings');
}

function sanitizeSavedMappings(raw: unknown): SavedImportMappingRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      const id = typeof candidate.id === 'string' ? candidate.id : '';
      const name = typeof candidate.name === 'string' ? candidate.name : '';
      const mapping_json = candidate.mapping_json && typeof candidate.mapping_json === 'object'
        ? (candidate.mapping_json as Mapping)
        : {};
      const source_type =
        candidate.source_type === 'pdf' || candidate.source_type === 'excel'
          ? (candidate.source_type as 'excel' | 'pdf')
          : 'excel';
      const template_key =
        typeof candidate.template_key === 'string' && candidate.template_key.trim()
          ? candidate.template_key.trim()
          : null;
      const created_at = typeof candidate.created_at === 'string' ? candidate.created_at : '';
      const updated_at = typeof candidate.updated_at === 'string' ? candidate.updated_at : '';

      if (!id || !name) return null;
      return {
        id,
        name,
        mapping_json,
        source_type,
        template_key,
        created_at: created_at || new Date().toISOString(),
        updated_at: updated_at || new Date().toISOString(),
      } as SavedImportMappingRow;
    })
    .filter((x): x is SavedImportMappingRow => !!x)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

function createMappingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mapping-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function loadMappingsFromPreferences(userId: string, tenantId: string): Promise<SavedImportMappingRow[]> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preference_value')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('preference_key', IMPORT_MAPPINGS_PREF_KEY)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return sanitizeSavedMappings(data?.preference_value);
}

async function saveMappingToPreferences(
  userId: string,
  tenantId: string,
  name: string,
  mapping: Mapping,
  sourceType: 'excel' | 'pdf' = 'excel',
  templateKey?: string,
): Promise<SavedImportMappingRow> {
  const now = new Date().toISOString();
  const current = await loadMappingsFromPreferences(userId, tenantId);
  const existingIndex = current.findIndex(
    (m) => m.name === name && (m.source_type || 'excel') === sourceType && (m.template_key || '') === (templateKey || ''),
  );

  let nextSaved: SavedImportMappingRow;
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    nextSaved = {
      ...existing,
      mapping_json: mapping,
      source_type: sourceType,
      template_key: templateKey || null,
      updated_at: now,
    };
    current[existingIndex] = nextSaved;
  } else {
    nextSaved = {
      id: createMappingId(),
      name,
      mapping_json: mapping,
      source_type: sourceType,
      template_key: templateKey || null,
      created_at: now,
      updated_at: now,
    };
    current.push(nextSaved);
  }

  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        preference_key: IMPORT_MAPPINGS_PREF_KEY,
        preference_value: current,
        updated_at: now,
      },
      { onConflict: 'user_id,tenant_id,preference_key' },
    );

  if (error) {
    throw error;
  }

  return nextSaved;
}

function normKey(name: string): string {
  return (name || '').trim().toLowerCase();
}

function skuKey(sku?: string | null): string {
  return (sku || '').trim().toLowerCase();
}

function productKey(nameNorm: string, categoryId: string, sku?: string | null): string {
  const skuNorm = skuKey(sku);
  return `${nameNorm}||${categoryId}||${skuNorm}`;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const importRateBuckets = new Map<string, number[]>();

function guardImportRateLimit(req: any, limit: number, windowMs: number): string | null {
  const tenantId = req?.tenant?.tenantId || 'unknown-tenant';
  const userId = req?.user?.id || 'unknown-user';
  const routeKey = req?.route?.path || req?.path || 'unknown-route';
  const key = `${tenantId}:${userId}:${routeKey}`;
  const now = Date.now();
  const from = now - windowMs;
  const prev = importRateBuckets.get(key) || [];
  const recent = prev.filter((t) => t >= from);
  if (recent.length >= limit) {
    return 'יותר מדי בקשות בזמן קצר. נסה שוב בעוד כמה שניות.';
  }
  recent.push(now);
  importRateBuckets.set(key, recent);
  return null;
}

function toUserImportError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error || '');
  const raw = String(message || '');

  if (raw.includes('Missing AWS_REGION')) {
    return { status: 400, message: 'Missing AWS_REGION' };
  }
  if (raw.includes('sourceType=pdf דורש קובץ PDF חוקי')) {
    return { status: 400, message: 'sourceType=pdf requires a valid PDF file' };
  }
  if (raw.includes('sourceType=excel לא יכול לקבל PDF')) {
    return { status: 400, message: 'sourceType=excel cannot accept a PDF file' };
  }

  if (raw.includes('AccessDeniedException') || raw.includes('textract:AnalyzeDocument')) {
    return {
      status: 400,
      message: 'אין הרשאה ל-AWS Textract. יש להוסיף הרשאת textract:AnalyzeDocument למשתמש/Role של השרת.',
    };
  }
  if (
    raw.includes('UnsupportedDocumentException') ||
    raw.includes('unsupported document format') ||
    raw.includes('ה-PDF לא נתמך על ידי AWS Textract')
  ) {
    return {
      status: 400,
      message: raw.includes('אבחון:')
        ? raw
        : 'ה-PDF לא נתמך על ידי Textract בפורמט הנוכחי. נסה לשמור מחדש (Print to PDF) או לפצל לעמודים בודדים.',
    };
  }

  if (
    raw.includes('sourceType=pdf') ||
    raw.includes('לא נמצאו טבלאות') ||
    raw.includes('טווח עמודים גדול מדי') ||
    raw.includes('לא נמצאו גיליונות בקובץ')
  ) {
    return { status: 400, message: raw };
  }

  return { status: 500, message: 'שגיאת שרת בתהליך הייבוא' };
}

function hasPdfMagicBytes(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  return (
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 // F
  );
}

function columnLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function cleanHeaderToken(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\u0590-\u05ffa-z0-9 %]/g, '');
}

function parseNumberSmart(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  let value = String(raw)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[₪$€£]/g, '')
    .replace(/%/g, '');

  if (!value) return null;

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const parts = value.split(',');
    if (parts.length > 2) {
      value = parts.join('');
    } else {
      const [a = '', b = ''] = parts;
      if (b.length === 3) {
        value = `${a}${b}`;
      } else {
        value = `${a}.${b}`;
      }
    }
  } else if ((value.match(/\./g) || []).length > 1) {
    value = value.replace(/\./g, '');
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseBooleanFlag(raw: unknown, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const txt = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(txt)) return true;
  if (['0', 'false', 'no', 'off'].includes(txt)) return false;
  return defaultValue;
}

function parseSheetIndex(raw: unknown, sheetCount: number): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n < 0 || n >= sheetCount) return 0;
  return Math.floor(n);
}

function parseTableIndex(raw: unknown, tableCount: number): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n < 0 || n >= tableCount) return 0;
  return Math.floor(n);
}

function parseSourceType(raw: unknown): 'excel' | 'pdf' {
  const parsed = importSourceTypeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return 'excel';
}

function parsePositiveInt(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function parseMapping(raw: unknown): Mapping {
  if (!raw) return {};
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const out: Mapping = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || value === undefined || value === '' || value === 'ignored') {
      out[key] = null;
      continue;
    }
    const n = Number(value);
    out[key] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }
  return out;
}

function parseIgnoredRows(raw: unknown): Set<number> {
  if (raw === undefined || raw === null || raw === '') return new Set<number>();

  let values: unknown[] = [];
  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === 'string') {
    const txt = raw.trim();
    if (!txt) return new Set<number>();
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) {
        values = parsed;
      } else {
        values = txt.split(',').map((v) => v.trim());
      }
    } catch {
      values = txt.split(',').map((v) => v.trim());
    }
  } else {
    return new Set<number>();
  }

  const out = new Set<number>();
  for (const value of values) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0) {
      out.add(n);
    }
  }
  return out;
}

function filterIgnoredRows(rows: unknown[][], ignoredRows: Set<number>): unknown[][] {
  if (!ignoredRows.size) return rows;
  return rows.filter((_, idx) => !ignoredRows.has(idx));
}

function parseManualSupplierName(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const name = String(raw).trim();
  if (!name) return undefined;
  return name.slice(0, 120);
}

function parseManualValuesByRow(raw: unknown): Map<number, Record<string, string>> {
  if (raw === undefined || raw === null || raw === '') return new Map<number, Record<string, string>>();
  let input: unknown = raw;
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw);
    } catch {
      return new Map<number, Record<string, string>>();
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return new Map<number, Record<string, string>>();

  const out = new Map<number, Record<string, string>>();
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const rowIndex = Number(k);
    if (!Number.isInteger(rowIndex) || rowIndex < 0) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const rowInput = v as Record<string, unknown>;
    const normalizedRow: Record<string, string> = {};
    for (const [fieldKey, rawValue] of Object.entries(rowInput)) {
      const key = String(fieldKey || '').trim();
      const value = String(rawValue ?? '').trim();
      if (!key || !value) continue;
      normalizedRow[key] = value;
    }
    if (Object.keys(normalizedRow).length > 0) {
      out.set(rowIndex, normalizedRow);
    }
  }
  return out;
}

function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'buffer', raw: false });
}

function rowsFromSheet(workbook: XLSX.WorkBook, sheetIndex: number): unknown[][] {
  const safeSheetIndex = parseSheetIndex(sheetIndex, workbook.SheetNames.length);
  const sheetName = workbook.SheetNames[safeSheetIndex];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  }) as unknown[][];
}

function buildColumns(rows: unknown[][], hasHeader: boolean): Array<{ index: number; letter: string; headerValue: string }> {
  const maxCols = Math.max(
    1,
    ...rows.slice(0, 50).map((r) => (Array.isArray(r) ? r.length : 0)),
  );
  const headerRow = hasHeader ? (rows[0] || []) : [];
  return Array.from({ length: maxCols }).map((_, idx) => ({
    index: idx,
    letter: columnLetter(idx),
    headerValue: String(headerRow[idx] ?? '').trim(),
  }));
}

function suggestMapping(columns: Array<{ index: number; letter: string; headerValue: string }>): Mapping {
  const mapping: Mapping = {};

  const aliases: Array<{ field: string; tests: string[] }> = [
    { field: 'product_name', tests: ['product name', 'product', 'מוצר', 'שם מוצר', 'פריט'] },
    { field: 'sku', tests: ['sku', 'מקט', 'מק ט', 'barcode sku'] },
    { field: 'barcode', tests: ['barcode', 'ברקוד'] },
    { field: 'category', tests: ['category', 'קטגוריה'] },
    { field: 'package_quantity', tests: ['package quantity', 'quantity', 'כמות באריזה', 'כמות'] },
    { field: 'supplier', tests: ['supplier', 'ספק'] },
    { field: 'price', tests: ['price', 'מחיר', 'cost', 'עלות'] },
    { field: 'discount_percent', tests: ['discount', 'הנחה', 'אחוז הנחה'] },
    { field: 'vat', tests: ['vat', 'מעמ', 'מע מ'] },
    { field: 'currency', tests: ['currency', 'מטבע'] },
  ];

  const usedColumns = new Set<number>();

  for (const alias of aliases) {
    const match = columns.find((col) => {
      if (usedColumns.has(col.index)) return false;
      const token = cleanHeaderToken(col.headerValue);
      if (!token) return false;
      return alias.tests.some((test) => token.includes(cleanHeaderToken(test)));
    });
    if (match) {
      mapping[alias.field] = match.index;
      usedColumns.add(match.index);
    }
  }

  let supplierPair = 1;
  let pricePair = 1;
  let discountPair = 1;

  for (const col of columns) {
    const token = cleanHeaderToken(col.headerValue);
    if (!token) continue;

    if (token.includes('supplier') || token.includes('ספק')) {
      mapping[`supplier_${supplierPair}`] = col.index;
      supplierPair += 1;
    } else if (
      (token.includes('price') || token.includes('מחיר') || token.includes('cost') || token.includes('עלות')) &&
      !token.includes('after') &&
      !token.includes('אחרי')
    ) {
      mapping[`price_${pricePair}`] = col.index;
      pricePair += 1;
    } else if (token.includes('discount') || token.includes('הנחה')) {
      mapping[`discount_percent_${discountPair}`] = col.index;
      discountPair += 1;
    }
  }

  if (mapping.supplier_1 === undefined && mapping.supplier !== undefined) {
    mapping.supplier_1 = mapping.supplier;
  }
  if (mapping.price_1 === undefined && mapping.price !== undefined) {
    mapping.price_1 = mapping.price;
  }
  if (mapping.discount_percent_1 === undefined && mapping.discount_percent !== undefined) {
    mapping.discount_percent_1 = mapping.discount_percent;
  }

  return mapping;
}

function toCellString(row: unknown[], colIndex: number | null | undefined): string {
  if (colIndex === null || colIndex === undefined || colIndex < 0) return '';
  return String(row[colIndex] ?? '').trim();
}

function toCellNumber(row: unknown[], colIndex: number | null | undefined): number | null {
  if (colIndex === null || colIndex === undefined || colIndex < 0) return null;
  return parseNumberSmart(row[colIndex]);
}

function getMappedColumn(mapping: Mapping, ...fields: string[]): number | null {
  for (const field of fields) {
    const value = mapping[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function collectPairIndexes(mapping: Mapping): number[] {
  const indexes = new Set<number>();
  for (const key of Object.keys(mapping)) {
    const m = key.match(/^(supplier|price|discount_percent|vat|currency)_(\d+)$/);
    if (m) indexes.add(Number(m[2]));
  }

  if (mapping.supplier !== undefined || mapping.price !== undefined || mapping.discount_percent !== undefined) {
    indexes.add(1);
  }

  return Array.from(indexes).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
}

function normalizeRowsWithMapping(
  rawRows: unknown[][],
  hasHeader: boolean,
  mapping: Mapping,
  options?: { manualSupplierName?: string; manualValuesByRow?: Map<number, Record<string, string>> },
): {
  rows: ImportRow[];
  rowErrors: RowError[];
  fieldErrors: string[];
  statsEstimate: {
    totalInputRows: number;
    mappedRows: number;
    skippedRows: number;
    uniqueSuppliers: number;
    uniqueCategories: number;
    uniqueProducts: number;
  };
} {
  const fieldErrors: string[] = [];
  const rowErrors: RowError[] = [];
  const normalizedRows: ImportRow[] = [];
  const manualSupplier = (options?.manualSupplierName || '').trim();
  const manualValuesByRow = options?.manualValuesByRow || new Map<number, Record<string, string>>();
  const manualFieldKeys = new Set<string>();
  manualValuesByRow.forEach((rowValues) => {
    Object.keys(rowValues).forEach((k) => manualFieldKeys.add(k));
  });

  const dataRows = rawRows.slice(hasHeader ? 1 : 0);

  const productCol = getMappedColumn(mapping, 'product_name');
  const skuCol = getMappedColumn(mapping, 'sku');
  const barcodeCol = getMappedColumn(mapping, 'barcode');
  const categoryCol = getMappedColumn(mapping, 'category');
  const packageQtyCol = getMappedColumn(mapping, 'package_quantity');
  const sharedDiscountCol = getMappedColumn(mapping, 'discount_percent');
  const sharedVatCol = getMappedColumn(mapping, 'vat');
  const sharedCurrencyCol = getMappedColumn(mapping, 'currency');

  if (productCol === null) {
    fieldErrors.push('חובה למפות עמודה לשדה "שם מוצר"');
  }

  const pairIndexesSet = new Set<number>(collectPairIndexes(mapping));
  manualFieldKeys.forEach((key) => {
    const match = key.match(/^(supplier|price|discount_percent|vat|currency)_(\d+)$/);
    if (match) pairIndexesSet.add(Number(match[2]));
  });
  if (manualFieldKeys.has('supplier') || manualFieldKeys.has('price') || manualFieldKeys.has('discount_percent')) {
    pairIndexesSet.add(1);
  }
  const pairIndexes = Array.from(pairIndexesSet).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!pairIndexes.length) {
    fieldErrors.push('חובה למפות לפחות עמודת מחיר אחת');
  }

  const pairDefs = pairIndexes.map((index) => ({
    index,
    supplierCol: getMappedColumn(mapping, `supplier_${index}`, index === 1 ? 'supplier' : ''),
    priceCol: getMappedColumn(mapping, `price_${index}`, index === 1 ? 'price' : ''),
    discountCol: getMappedColumn(mapping, `discount_percent_${index}`, index === 1 ? 'discount_percent' : ''),
    vatCol: getMappedColumn(mapping, `vat_${index}`),
    currencyCol: getMappedColumn(mapping, `currency_${index}`),
  }));

  const hasUsablePair = pairDefs.some((p) => {
    const hasPrice = p.priceCol !== null || manualFieldKeys.has(`price_${p.index}`) || (p.index === 1 && manualFieldKeys.has('price'));
    const hasSupplier =
      p.supplierCol !== null ||
      manualFieldKeys.has(`supplier_${p.index}`) ||
      (p.index === 1 && manualFieldKeys.has('supplier')) ||
      !!manualSupplier;
    return hasPrice && hasSupplier;
  });
  if (!hasUsablePair) {
    if (manualSupplier) {
      fieldErrors.push('לא נמצאה עמודת מחיר ממופה');
    } else {
      fieldErrors.push('לא נמצא זוג מיפוי מלא של ספק + מחיר, או בחר "ספק קבוע לכל הקובץ"');
    }
  }

  if (fieldErrors.length) {
    return {
      rows: [],
      rowErrors,
      fieldErrors,
      statsEstimate: {
        totalInputRows: dataRows.length,
        mappedRows: 0,
        skippedRows: dataRows.length,
        uniqueSuppliers: 0,
        uniqueCategories: 0,
        uniqueProducts: 0,
      },
    };
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = Array.isArray(dataRows[i]) ? dataRows[i] : [];
    const rawRowIndex = i + (hasHeader ? 1 : 0);
    const visualRow = i + (hasHeader ? 2 : 1);
    const manualRow = manualValuesByRow.get(rawRowIndex) || {};
    const manualText = (fieldKey: string): string => String(manualRow[fieldKey] ?? '').trim();
    const manualNumber = (fieldKey: string): number | null => parseNumberSmart(manualText(fieldKey));

    const productName = manualText('product_name') || toCellString(row, productCol);
    if (!productName) {
      rowErrors.push({ row: visualRow, message: 'שם מוצר חסר - שורה דולגה' });
      continue;
    }

    const sku = manualText('sku') || toCellString(row, skuCol) || undefined;
    const barcode = manualText('barcode') || toCellString(row, barcodeCol) || undefined;
    const category = manualText('category') || toCellString(row, categoryCol) || 'כללי';
    const packageQtyRaw = manualNumber('package_quantity') ?? toCellNumber(row, packageQtyCol);
    const sharedDiscountRaw = manualNumber('discount_percent') ?? toCellNumber(row, sharedDiscountCol);
    const sharedVatRaw = manualNumber('vat') ?? toCellNumber(row, sharedVatCol);
    const sharedCurrency = manualText('currency') || toCellString(row, sharedCurrencyCol) || undefined;

    let packageQty: number | undefined;
    const effectivePackageQtyRaw = packageQtyRaw ?? manualNumber('package_quantity');
    if (effectivePackageQtyRaw !== null) {
      if (effectivePackageQtyRaw > 0) packageQty = effectivePackageQtyRaw;
      else rowErrors.push({ row: visualRow, message: 'כמות באריזה חייבת להיות מספר חיובי (או ריק)' });
    }

    if (sharedDiscountRaw !== null && (sharedDiscountRaw < 0 || sharedDiscountRaw > 100)) {
      rowErrors.push({ row: visualRow, message: 'אחוז הנחה חייב להיות בין 0 ל-100' });
    }

    let mappedPairs = 0;
    for (const pair of pairDefs) {
      const manualSupplierForPair = manualText(`supplier_${pair.index}`) || (pair.index === 1 ? manualText('supplier') : '');
      const manualPriceForPair = manualText(`price_${pair.index}`) || (pair.index === 1 ? manualText('price') : '');
      const manualDiscountForPair = manualNumber(`discount_percent_${pair.index}`) ?? (pair.index === 1 ? manualNumber('discount_percent') : null);
      const manualVatForPair = manualNumber(`vat_${pair.index}`) ?? (pair.index === 1 ? manualNumber('vat') : null);
      const manualCurrencyForPair = manualText(`currency_${pair.index}`) || (pair.index === 1 ? manualText('currency') : '');

      if (pair.priceCol === null && !manualPriceForPair) continue;

      const supplier = manualSupplierForPair || manualSupplier || toCellString(row, pair.supplierCol);
      const priceRaw = manualPriceForPair || toCellString(row, pair.priceCol);

      // fallback rule: partial pair -> skip this pair only
      if (!priceRaw) continue;
      if (!supplier) {
        rowErrors.push({ row: visualRow, message: `ספק חסר בזוג #${pair.index} (או הגדר ספק קבוע לכל הקובץ)` });
        continue;
      }

      const priceNum = parseNumberSmart(priceRaw);
      if (priceNum === null || priceNum <= 0) {
        rowErrors.push({ row: visualRow, message: `מחיר לא תקין בזוג ספק/מחיר #${pair.index}` });
        continue;
      }

      const pairDiscountRaw = manualDiscountForPair ?? toCellNumber(row, pair.discountCol);
      const discountPercent = pairDiscountRaw ?? sharedDiscountRaw ?? 0;
      if (discountPercent < 0 || discountPercent > 100) {
        rowErrors.push({ row: visualRow, message: `אחוז הנחה לא תקין בזוג #${pair.index}` });
        continue;
      }

      const pairVat = manualVatForPair ?? toCellNumber(row, pair.vatCol) ?? sharedVatRaw ?? undefined;
      const pairCurrency = manualCurrencyForPair || toCellString(row, pair.currencyCol) || sharedCurrency;

      normalizedRows.push({
        product_name: productName,
        supplier,
        price: priceNum,
        category,
        sku,
        barcode,
        package_quantity: packageQty,
        discount_percent: discountPercent,
        vat: pairVat ?? undefined,
        currency: pairCurrency ?? undefined,
      });
      mappedPairs += 1;
    }

    if (mappedPairs === 0) {
      rowErrors.push({ row: visualRow, message: 'לא נמצא זוג ספק/מחיר תקין בשורה' });
    }
  }

  const suppliers = new Set(normalizedRows.map((r) => normKey(r.supplier)).filter(Boolean));
  const categories = new Set(normalizedRows.map((r) => normKey(r.category || 'כללי')).filter(Boolean));
  const products = new Set(normalizedRows.map((r) => normalizeName(r.product_name)).filter(Boolean));

  return {
    rows: normalizedRows,
    rowErrors,
    fieldErrors,
    statsEstimate: {
      totalInputRows: dataRows.length,
      mappedRows: normalizedRows.length,
      skippedRows: Math.max(0, dataRows.length - normalizedRows.length),
      uniqueSuppliers: suppliers.size,
      uniqueCategories: categories.size,
      uniqueProducts: products.size,
    },
  };
}

function dedupeLastRowWins(rows: ImportRow[]): ImportRow[] {
  const seen = new Map<string, ImportRow>();
  for (const row of rows) {
    const key =
      `${normalizeName(row.product_name)}|` +
      `${normKey(row.supplier)}|` +
      `${normKey(row.category || 'כללי')}|` +
      `${skuKey(row.sku)}|` +
      `${skuKey(row.barcode)}`;
    seen.set(key, row);
  }
  return Array.from(seen.values());
}

type SourceRowsResult = {
  sourceType: 'excel' | 'pdf';
  rows: unknown[][];
  selectedSheet?: number;
  selectedTableIndex?: number;
  sheets?: Array<{ name: string; index: number }>;
  pdfTables?: Array<{
    tableIndex: number;
    pageStart: number;
    pageEnd: number;
    columns: Array<{ index: number; letter: string; headerValue: string }>;
    sampleRows: Array<Array<string | number | null>>;
    suggestedMapping: Mapping;
  }>;
  warnings?: string[];
};

async function resolveSourceRows(
  file: Express.Multer.File,
  body: any,
): Promise<SourceRowsResult> {
  const sourceType = parseSourceType(body?.sourceType);
  const isPdfBytes = hasPdfMagicBytes(file.buffer);

  if (sourceType === 'pdf') {
    if (!isPdfBytes) {
      throw new Error('sourceType=pdf דורש קובץ PDF חוקי');
    }
    const pageFrom = parsePositiveInt(body?.pageFrom);
    const pageTo = parsePositiveInt(body?.pageTo);
    const extracted = await extractPdfTablesWithTextract(file.buffer, {
      pageFrom,
      pageTo,
      maxPages: MAX_PDF_PREVIEW_PAGES,
    });
    if (!extracted.tables.length) {
      throw new Error('לא נמצאו טבלאות ב-PDF. נסה טווח עמודים אחר או קובץ אחר.');
    }

    const hasHeader = parseBooleanFlag(body?.hasHeader, true);
    const selectedTableIndex = parseTableIndex(body?.tableIndex, extracted.tables.length);
    const selectedTable = extracted.tables[selectedTableIndex];
    const rows = selectedTable.rows;

    const pdfTables = extracted.tables.map((table) => {
      const columns = buildColumns(table.rows, hasHeader);
      const sampleRows = table.rows.slice(0, 50).map((row) =>
        Array.from({ length: columns.length }).map((_, idx) => row[idx] ?? ''),
      );
      return {
        tableIndex: table.tableIndex,
        pageStart: table.pageStart,
        pageEnd: table.pageEnd,
        columns,
        sampleRows,
        suggestedMapping: suggestMapping(columns),
      };
    });

    return {
      sourceType,
      rows,
      selectedTableIndex,
      pdfTables,
      warnings: extracted.warnings,
    };
  }

  if (isPdfBytes) {
    throw new Error('sourceType=excel לא יכול לקבל PDF');
  }

  const workbook = readWorkbook(file.buffer);
  if (!workbook.SheetNames.length) {
    throw new Error('לא נמצאו גיליונות בקובץ');
  }

  const selectedSheet = parseSheetIndex(body?.sheetIndex, workbook.SheetNames.length);
  const rows = rowsFromSheet(workbook, selectedSheet);
  const sheets = workbook.SheetNames.map((name, index) => ({ name, index }));
  return {
    sourceType,
    rows,
    selectedSheet,
    sheets,
  };
}

router.post('/preview', requireAuth, requireTenant, upload.single('file'), async (req, res) => {
  try {
    const rateLimited = guardImportRateLimit(req, 20, 60_000);
    if (rateLimited) return res.status(429).json({ error: rateLimited });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'לא הועלה קובץ' });
    const source = await resolveSourceRows(file, req.body);
    const hasHeader = parseBooleanFlag(req.body?.hasHeader, true);
    const rows = source.rows;
    const columns = buildColumns(rows, hasHeader);

    const sampleRows = rows.slice(0, 50).map((row) =>
      Array.from({ length: columns.length }).map((_, idx) => row[idx] ?? ''),
    );
    const suggestedMapping = suggestMapping(columns);

    return res.json({
      sourceType: source.sourceType,
      sheets: source.sheets || [],
      selectedSheet: source.selectedSheet ?? 0,
      selectedTableIndex: source.selectedTableIndex ?? 0,
      tables: source.pdfTables || [],
      hasHeader,
      columns,
      sampleRows,
      suggestedMapping,
      warnings: source.warnings || [],
    });
  } catch (error) {
    console.error('Import preview error:', error);
    const normalized = toUserImportError(error);
    return res.status(normalized.status).json({ error: normalized.message });
  }
});

router.post('/validate-mapping', requireAuth, requireTenant, upload.single('file'), async (req, res) => {
  try {
    const rateLimited = guardImportRateLimit(req, 30, 60_000);
    if (rateLimited) return res.status(429).json({ error: rateLimited });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'לא הועלה קובץ' });
    const source = await resolveSourceRows(file, req.body);
    const hasHeader = parseBooleanFlag(req.body?.hasHeader, true);
    const mapping = parseMapping(req.body?.mapping);
    const ignoredRows = parseIgnoredRows(req.body?.ignoredRows);
    const manualSupplierName = parseManualSupplierName(req.body?.manualSupplierName);
    const manualValuesByRow = parseManualValuesByRow(req.body?.manualValuesByRow);

    const rows = filterIgnoredRows(source.rows, ignoredRows);
    const normalized = normalizeRowsWithMapping(rows, hasHeader, mapping, { manualSupplierName, manualValuesByRow });

    return res.json({
      sourceType: source.sourceType,
      selectedTableIndex: source.selectedTableIndex ?? 0,
      selectedSheet: source.selectedSheet ?? 0,
      fieldErrors: normalized.fieldErrors,
      rowErrors: normalized.rowErrors.slice(0, 50),
      normalizedPreview: normalized.rows.slice(0, 100),
      statsEstimate: normalized.statsEstimate,
    });
  } catch (error) {
    console.error('Validate mapping error:', error);
    const normalized = toUserImportError(error);
    return res.status(normalized.status).json({ error: normalized.message });
  }
});

router.get('/mappings', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const sourceTypeRaw = typeof req.query?.source_type === 'string' ? req.query.source_type : undefined;
    const sourceTypeFilter = sourceTypeRaw ? parseSourceType(sourceTypeRaw) : undefined;
    const templateKeyFilter = typeof req.query?.template_key === 'string' ? req.query.template_key.trim() : '';

    let query = supabase
      .from('import_mappings')
      .select('id,name,mapping_json,source_type,template_key,created_at,updated_at')
      .eq('tenant_id', tenant.tenantId)
      .order('updated_at', { ascending: false });
    if (sourceTypeFilter) {
      query = query.eq('source_type', sourceTypeFilter);
    }
    if (templateKeyFilter) {
      query = query.eq('template_key', templateKeyFilter);
    }
    let { data, error } = await query;

    // Backward compatibility: table exists but new columns not yet migrated.
    if (error && String(error.message || '').includes('source_type')) {
      const legacy = await supabase
        .from('import_mappings')
        .select('id,name,mapping_json,created_at,updated_at')
        .eq('tenant_id', tenant.tenantId)
        .order('updated_at', { ascending: false });
      data = (legacy.data || []).map((row: any) => ({ ...row, source_type: 'excel', template_key: null }));
      error = legacy.error;
    }

    if (error) {
      if (isMissingImportMappingsTable(error)) {
        const fallbackMappings = (await loadMappingsFromPreferences(user.id, tenant.tenantId))
          .filter((m) => (sourceTypeFilter ? (m.source_type || 'excel') === sourceTypeFilter : true))
          .filter((m) => (templateKeyFilter ? (m.template_key || '') === templateKeyFilter : true));
        return res.json({ mappings: fallbackMappings });
      }
      console.error('Load mappings error:', error);
      return res.status(500).json({ error: 'שגיאה בטעינת מיפויים שמורים' });
    }

    return res.json({ mappings: data || [] });
  } catch (error) {
    console.error('Load mappings error:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.post('/mappings', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const parsed = mappingSaveSchema.parse(req.body || {});

    const payload = {
      tenant_id: tenant.tenantId,
      name: parsed.name,
      mapping_json: parsed.mapping,
      source_type: parsed.source_type || 'excel',
      template_key: parsed.template_key || null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('import_mappings')
      .upsert(payload, { onConflict: 'tenant_id,name' })
      .select('id,name,mapping_json,created_at,updated_at')
      .single();

    if (error) {
      // Backward compatibility: table exists but new columns not yet migrated.
      if (String(error.message || '').includes('source_type') || String(error.message || '').includes('template_key')) {
        const legacy = await supabase
          .from('import_mappings')
          .upsert(
            {
              tenant_id: tenant.tenantId,
              name: parsed.name,
              mapping_json: parsed.mapping,
              created_by: user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id,name' },
          )
          .select('id,name,mapping_json,created_at,updated_at')
          .single();
        if (!legacy.error && legacy.data) {
          return res.json({ mapping: { ...legacy.data, source_type: 'excel', template_key: null } });
        }
      }
      if (isMissingImportMappingsTable(error)) {
        const fallbackSaved = await saveMappingToPreferences(
          user.id,
          tenant.tenantId,
          parsed.name,
          parsed.mapping,
          parsed.source_type || 'excel',
          parsed.template_key,
        );
        return res.json({ mapping: fallbackSaved });
      }
      console.error('Save mapping error:', error);
      return res.status(500).json({ error: 'שגיאה בשמירת המיפוי' });
    }

    return res.json({ mapping: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues?.[0]?.message || 'נתונים לא תקינים' });
    }
    console.error('Save mapping error:', error);
    return res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.post('/apply', requireAuth, requireTenant, upload.single('file'), async (req, res) => {
  try {
    const rateLimited = guardImportRateLimit(req, 20, 60_000);
    if (rateLimited) return res.status(429).json({ error: rateLimited });

    const tenant = (req as any).tenant;
    const user = (req as any).user;
    const mode = importModeSchema.parse(req.query.mode || 'merge');
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'לא הועלה קובץ' });
    }

    const source = await resolveSourceRows(file, req.body);
    const hasHeader = parseBooleanFlag(req.body?.hasHeader, true);
    const mapping = parseMapping(req.body?.mapping);
    const ignoredRows = parseIgnoredRows(req.body?.ignoredRows);
    const manualSupplierName = parseManualSupplierName(req.body?.manualSupplierName);
    const manualValuesByRow = parseManualValuesByRow(req.body?.manualValuesByRow);

    const rowsRaw = filterIgnoredRows(source.rows, ignoredRows);
    const normalized = normalizeRowsWithMapping(rowsRaw, hasHeader, mapping, { manualSupplierName, manualValuesByRow });

    if (normalized.fieldErrors.length) {
      return res.status(400).json({ error: normalized.fieldErrors.join('\n') });
    }
    if (!normalized.rows.length) {
      return res.status(400).json({
        error: 'לא נמצאו שורות תקינות לייבוא אחרי המיפוי',
        rowErrors: normalized.rowErrors.slice(0, 50),
      });
    }

    // last row wins for same product+supplier+category in the same file
    const rows = dedupeLastRowWins(normalized.rows);

    // Get settings for VAT, margin, use_margin, and use_vat
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('vat_percent,global_margin_percent,use_margin,use_vat')
      .eq('tenant_id', tenant.tenantId)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
    }

    const vatPercent = settings?.vat_percent || 18;
    const globalMarginPercent = settings?.global_margin_percent ?? 30;
    const useMargin = settings?.use_margin === true;
    const useVat = settings?.use_vat === true;

    // OVERWRITE mode: delete all tenant data
    if (mode === 'overwrite') {
      if (tenant.role !== 'owner') {
        return res.status(403).json({ error: 'פעולת overwrite זמינה לבעלים בלבד' });
      }

      await supabase.from('price_entries').delete().eq('tenant_id', tenant.tenantId);
      await supabase.from('products').delete().eq('tenant_id', tenant.tenantId);
      await supabase.from('suppliers').delete().eq('tenant_id', tenant.tenantId);
      await supabase.from('categories').delete().eq('tenant_id', tenant.tenantId).neq('name', 'כללי');
      await supabase.from('settings').delete().eq('tenant_id', tenant.tenantId);

      await supabase.from('settings').insert({
        tenant_id: tenant.tenantId,
        vat_percent: 18,
      });

      const { data: defaultCategories } = await supabase
        .from('categories')
        .select('id')
        .eq('tenant_id', tenant.tenantId)
        .eq('name', 'כללי')
        .eq('is_active', true);

      const defaultCategory = Array.isArray(defaultCategories) ? defaultCategories[0] : null;
      if (!defaultCategory) {
        await supabase.from('categories').insert({
          tenant_id: tenant.tenantId,
          name: 'כללי',
          default_margin_percent: 0,
          is_active: true,
          created_by: user.id,
        });
      }
    }

    const stats = {
      suppliersCreated: 0,
      categoriesCreated: 0,
      productsCreated: 0,
      pricesInserted: 0,
      pricesSkipped: 0,
    };
    const productsByCategory = new Map<string, Set<string>>();

    // 1) Get or create default category
    let defaultCategoryId: string;
    const { data: defaultCategories } = await supabase
      .from('categories')
      .select('id')
      .eq('tenant_id', tenant.tenantId)
      .eq('name', 'כללי')
      .eq('is_active', true);

    const defaultCategory = Array.isArray(defaultCategories) ? defaultCategories[0] : null;
    if (defaultCategory) {
      defaultCategoryId = defaultCategory.id;
    } else {
      const { data: newCategory, error: defaultCategoryInsertError } = await supabase
        .from('categories')
        .insert({
          tenant_id: tenant.tenantId,
          name: 'כללי',
          default_margin_percent: globalMarginPercent,
          is_active: true,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (!newCategory || defaultCategoryInsertError) {
        throw new Error('שגיאה ביצירת קטגוריה כללית בעת ייבוא הנתונים');
      }
      defaultCategoryId = newCategory.id;
    }

    // 2) Validate rows once
    const validRows = rows.filter((r) =>
      r.product_name &&
      r.product_name.trim() !== '' &&
      r.supplier &&
      r.supplier.trim() !== '' &&
      r.price &&
      r.price > 0,
    );

    // 3) Collect unique entities
    const suppliersNeeded = new Set<string>();
    const categoriesNeeded = new Set<string>();
    const productsNeeded: Array<{
      name: string;
      nameNorm: string;
      categoryName: string;
      sku?: string | null;
      packageQty?: number | null;
    }> = [];

    for (const r of validRows) {
      suppliersNeeded.add(normKey(r.supplier));
      const categoryName = (r.category && r.category.trim()) ? r.category.trim() : 'כללי';
      categoriesNeeded.add(normKey(categoryName));

      const nameNorm = normalizeName(r.product_name);
      productsNeeded.push({
        name: r.product_name,
        nameNorm,
        categoryName,
        sku: r.sku?.trim() ? r.sku.trim() : null,
        packageQty: r.package_quantity && r.package_quantity > 0 ? r.package_quantity : null,
      });
    }

    // 4) Preload existing
    const [
      { data: existingSuppliers, error: supErr },
      { data: existingCategories, error: catErr },
      { data: existingProducts, error: prodErr },
    ] = await Promise.all([
      supabase.from('suppliers').select('id,name').eq('tenant_id', tenant.tenantId).eq('is_active', true),
      supabase.from('categories').select('id,name').eq('tenant_id', tenant.tenantId).eq('is_active', true),
      supabase.from('products').select('id,name_norm,category_id,name,sku').eq('tenant_id', tenant.tenantId).eq('is_active', true),
    ]);

    if (supErr) console.error('Error preloading suppliers:', supErr);
    if (catErr) console.error('Error preloading categories:', catErr);
    if (prodErr) console.error('Error preloading products:', prodErr);

    const supplierIdByName = new Map<string, string>();
    for (const s of (existingSuppliers || [])) supplierIdByName.set(normKey(s.name), s.id);

    const categoryIdByName = new Map<string, string>();
    const categoryNameById = new Map<string, string>();
    for (const c of (existingCategories || [])) {
      categoryIdByName.set(normKey(c.name), c.id);
      categoryNameById.set(c.id, c.name);
    }
    categoryIdByName.set(normKey('כללי'), defaultCategoryId);
    categoryNameById.set(defaultCategoryId, 'כללי');

    const productIdByKey = new Map<string, string>();
    for (const p of (existingProducts || [])) {
      productIdByKey.set(productKey(p.name_norm, p.category_id, p.sku || null), p.id);
    }

    // 5) Create missing suppliers
    const missingSuppliers = Array.from(suppliersNeeded).filter((n) => !supplierIdByName.has(n));
    if (missingSuppliers.length) {
      const supplierNameMap = new Map<string, string>();
      for (const r of validRows) {
        const key = normKey(r.supplier);
        if (!supplierNameMap.has(key)) supplierNameMap.set(key, r.supplier);
      }

      const supplierRows = missingSuppliers.map((n) => ({
        tenant_id: tenant.tenantId,
        name: supplierNameMap.get(n) || n,
        is_active: true,
        created_by: user.id,
      }));

      for (const part of chunk(supplierRows, 500)) {
        const { data: inserted, error } = await supabase
          .from('suppliers')
          .insert(part)
          .select('id,name');
        if (error) {
          console.error('Bulk supplier insert failed:', error);
          continue;
        }
        for (const s of (inserted || [])) {
          supplierIdByName.set(normKey(s.name), s.id);
          stats.suppliersCreated++;
        }
      }
    }

    // 6) Create missing categories
    const missingCategories = Array.from(categoriesNeeded)
      .filter((n) => n !== normKey('כללי'))
      .filter((n) => !categoryIdByName.has(n));

    if (missingCategories.length) {
      const categoryNameMap = new Map<string, string>();
      for (const r of validRows) {
        const categoryName = (r.category && r.category.trim()) ? r.category.trim() : 'כללי';
        const key = normKey(categoryName);
        if (!categoryNameMap.has(key)) categoryNameMap.set(key, categoryName);
      }

      const categoryRows = missingCategories.map((n) => ({
        tenant_id: tenant.tenantId,
        name: categoryNameMap.get(n) || n,
        default_margin_percent: 0,
        is_active: true,
        created_by: user.id,
      }));

      for (const part of chunk(categoryRows, 500)) {
        const { data: inserted, error } = await supabase
          .from('categories')
          .insert(part)
          .select('id,name');
        if (error) {
          console.error('Bulk category insert failed:', error);
          continue;
        }
        for (const c of (inserted || [])) {
          categoryIdByName.set(normKey(c.name), c.id);
          categoryNameById.set(c.id, c.name);
          stats.categoriesCreated++;
        }
      }
    }

    // 7) Create missing products
    const desiredProducts = new Map<string, {
      name: string;
      nameNorm: string;
      categoryId: string;
      sku?: string | null;
      packageQty?: number | null;
      categoryName: string;
    }>();

    for (const p of productsNeeded) {
      const catId = categoryIdByName.get(normKey(p.categoryName)) || defaultCategoryId;
      const key = productKey(p.nameNorm, catId, p.sku || null);
      if (!desiredProducts.has(key)) {
        desiredProducts.set(key, { ...p, categoryId: catId, categoryName: p.categoryName });
      } else {
        const existing = desiredProducts.get(key)!;
        if (!existing.sku && p.sku) existing.sku = p.sku;
        if (!existing.packageQty && p.packageQty) existing.packageQty = p.packageQty;
      }
    }

    const missingProductRows = Array.from(desiredProducts.entries())
      .filter(([key]) => !productIdByKey.has(key))
      .map(([, v]) => ({
        tenant_id: tenant.tenantId,
        name: v.name,
        name_norm: v.nameNorm,
        category_id: v.categoryId,
        unit: 'unit',
        sku: v.sku ?? null,
        package_quantity: v.packageQty ?? 1,
        is_active: true,
        created_by: user.id,
      }));

    if (missingProductRows.length) {
      for (const part of chunk(missingProductRows, 500)) {
        const { data: inserted, error } = await supabase
          .from('products')
          .insert(part)
          .select('id,name_norm,category_id,sku');
        if (error) {
          console.error('Bulk product insert failed:', error);
          continue;
        }
        for (const p of (inserted || [])) {
          productIdByKey.set(productKey(p.name_norm, p.category_id, p.sku || null), p.id);
          stats.productsCreated++;
        }
      }
    }

    // 8) Build price intents
    type PriceIntent = {
      row: ImportRow;
      supplierId: string;
      productId: string;
      categoryName: string;
      productNameNorm: string;
      discountPercent: number;
      costAfterDiscount: number;
      sellPrice: number;
    };

    const intents: PriceIntent[] = [];
    for (const r of validRows) {
      const supplierId = supplierIdByName.get(normKey(r.supplier));
      if (!supplierId) { stats.pricesSkipped++; continue; }

      const categoryName = (r.category && r.category.trim()) ? r.category.trim() : 'כללי';
      const categoryId = categoryIdByName.get(normKey(categoryName)) || defaultCategoryId;
      const nameNorm = normalizeName(r.product_name);
      const pId = productIdByKey.get(productKey(nameNorm, categoryId, r.sku || null));
      if (!pId) { stats.pricesSkipped++; continue; }

      const discountPercent = r.discount_percent ?? 0;
      const costAfterDiscount = calcCostAfterDiscount(r.price, discountPercent);
      const sellPrice = calcSellPrice({
        cost_price: r.price,
        margin_percent: globalMarginPercent,
        vat_percent: vatPercent,
        cost_price_after_discount: costAfterDiscount,
        use_margin: useMargin,
        use_vat: useVat,
      });

      intents.push({
        row: r,
        supplierId,
        productId: pId,
        categoryName,
        productNameNorm: nameNorm,
        discountPercent,
        costAfterDiscount,
        sellPrice,
      });
    }

    // Track products by category
    for (const v of desiredProducts.values()) {
      const category = v.categoryName || 'כללי';
      if (!productsByCategory.has(category)) productsByCategory.set(category, new Set());
      productsByCategory.get(category)!.add(v.nameNorm);
    }

    const usedProductIds = new Set(intents.map((i) => i.productId));
    for (const p of (existingProducts || [])) {
      if (usedProductIds.has(p.id)) {
        const categoryName = categoryNameById.get(p.category_id) || 'כללי';
        if (!productsByCategory.has(categoryName)) productsByCategory.set(categoryName, new Set());
        productsByCategory.get(categoryName)!.add(p.name_norm);
      }
    }

    // 9) Preload latest prices
    const productIds = Array.from(new Set(intents.map((i) => i.productId)));
    const supplierIds = Array.from(new Set(intents.map((i) => i.supplierId)));
    const latestPriceByPair = new Map<string, { cost_price: number; discount_percent: number | null; sell_price: number }>();

    if (productIds.length && supplierIds.length) {
      const { data: prices, error: pricesErr } = await supabase
        .from('price_entries')
        .select('product_id,supplier_id,cost_price,discount_percent,sell_price,created_at')
        .eq('tenant_id', tenant.tenantId)
        .in('product_id', productIds)
        .in('supplier_id', supplierIds)
        .order('created_at', { ascending: false });

      if (pricesErr) {
        console.error('Error preloading prices:', pricesErr);
      } else {
        for (const p of (prices || [])) {
          const key = `${p.product_id}||${p.supplier_id}`;
          if (!latestPriceByPair.has(key)) {
            latestPriceByPair.set(key, {
              cost_price: Number(p.cost_price),
              discount_percent: p.discount_percent === null ? null : Number(p.discount_percent),
              sell_price: Number(p.sell_price),
            });
          }
        }
      }
    }

    // 10) Insert new price entries
    const priceRowsToInsert = [];
    for (const i of intents) {
      const key = `${i.productId}||${i.supplierId}`;
      const current = latestPriceByPair.get(key);

      const same =
        current &&
        Number(current.cost_price) === i.row.price &&
        Number(current.discount_percent ?? 0) === i.discountPercent &&
        Number(current.sell_price) === i.sellPrice;

      if (same) {
        stats.pricesSkipped++;
        continue;
      }

      priceRowsToInsert.push({
        tenant_id: tenant.tenantId,
        product_id: i.productId,
        supplier_id: i.supplierId,
        cost_price: i.row.price,
        discount_percent: i.discountPercent,
        cost_price_after_discount: i.costAfterDiscount,
        margin_percent: globalMarginPercent,
        sell_price: i.sellPrice,
        package_quantity: i.row.package_quantity ?? 1,
        created_by: user.id,
      });
    }

    for (const part of chunk(priceRowsToInsert, 500)) {
      const { error } = await supabase.from('price_entries').insert(part);
      if (error) {
        console.error('Bulk price insert failed:', error);
        stats.pricesSkipped += part.length;
        continue;
      }
      stats.pricesInserted += part.length;
    }

    const categoryStats: Record<string, { total: number }> = {};
    for (const [category, productSet] of productsByCategory.entries()) {
      categoryStats[category] = { total: productSet.size };
    }

    return res.json({
      success: true,
      stats: {
        ...stats,
        byCategory: categoryStats,
      },
      rowErrors: normalized.rowErrors.slice(0, 50),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return res.status(400).json({ error: firstIssue?.message || 'נתונים לא תקינים' });
    }

    const errorMessage = error instanceof Error ? error.message : 'שגיאת שרת לא ידועה';
    console.error('Import apply error:', errorMessage, {
      stack: error instanceof Error ? error.stack : undefined,
      tenantId: (req as any).tenant?.tenantId,
      userId: (req as any).user?.id,
    });
    return res.status(500).json({ error: errorMessage });
  }
});

export default router;
