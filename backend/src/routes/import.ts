import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { normalizeName } from '../lib/normalize.js';
import { calcSellPrice, calcCostAfterDiscount, clampDecimalPrecision, roundToPrecision } from '../lib/pricing.js';

type PdfExtractorModule = typeof import('../import/extractors/pdfExtractor.js');
let pdfExtractorModulePromise: Promise<PdfExtractorModule> | null = null;

async function loadPdfExtractorModule(): Promise<PdfExtractorModule> {
  if (!pdfExtractorModulePromise) {
    pdfExtractorModulePromise = import('../import/extractors/pdfExtractor.js');
  }
  return pdfExtractorModulePromise;
}

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
type PackageType = 'carton' | 'gallon' | 'bag' | 'bottle' | 'pack' | 'shrink' | 'sachet' | 'can' | 'roll' | 'unknown';

const PACKAGE_TYPES: ReadonlyArray<PackageType> = [
  'carton',
  'gallon',
  'bag',
  'bottle',
  'pack',
  'shrink',
  'sachet',
  'can',
  'roll',
  'unknown',
];

interface ImportRow {
  product_name: string;
  supplier: string;
  price: number;
  source_row?: number;
  category?: string;
  sku?: string;
  barcode?: string;
  package_quantity?: number;
  discount_percent?: number;
  vat?: number;
  currency?: string;
  package_type?: PackageType;
  pricing_unit?: 'unit' | 'kg' | 'liter';
  source_price_includes_vat?: boolean;
  vat_rate?: number;
  effective_from?: string;
}

interface RowError {
  row: number;
  message: string;
}

interface UnimportedProduct {
  row: number;
  productName: string;
  reason: string;
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

function parseBooleanSmart(raw: unknown): boolean | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const txt = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'כולל', 'כולל מעמ', 'כולל מע"מ'].includes(txt)) return true;
  if (['0', 'false', 'no', 'off', 'לא כולל', 'ללא', 'לפני מעמ', 'לפני מע"מ'].includes(txt)) return false;
  return null;
}

function parseDateSmart(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const txt = String(raw).trim();
  if (!txt) return null;

  const iso = new Date(txt);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();

  const match = txt.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function isMissingExtendedPriceInsertColumns(error: unknown): boolean {
  const raw = String((error as any)?.message || error || '').toLowerCase();
  if (!raw) return false;
  const mentionsExtended =
    raw.includes('package_type') ||
    raw.includes('source_price_includes_vat') ||
    raw.includes('vat_rate') ||
    raw.includes('effective_from');
  return mentionsExtended && (raw.includes('column') || raw.includes('does not exist') || raw.includes('schema cache'));
}

function normalizeImportedProductName(raw: string): string {
  return String(raw || '')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/([ךםןףץ])([א-ת])/g, '$1 $2')
    .replace(/([א-ת])(\d)/g, '$1 $2')
    .replace(/(\d)([א-ת])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/([א-ת])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([א-ת])/g, '$1 $2')
    .replace(/([^\s(])\(/g, '$1 (')
    .replace(/\)([^\s)])/g, ') $1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePackageType(raw: unknown, fallbackText?: string): PackageType {
  const txt = `${String(raw ?? '')} ${String(fallbackText ?? '')}`.trim().toLowerCase();
  if (!txt) return 'unknown';
  if (txt.includes('sachet') || txt.includes('שקית') || txt.includes('שקיו')) return 'sachet';
  if (txt.includes('bottle') || txt.includes('בקבוק') || txt.includes('בקבוקי')) return 'bottle';
  if (txt.includes('shrink') || txt.includes('שרינק')) return 'shrink';
  if (txt.includes('pack') || txt.includes('מארז') || txt.includes('חבילה') || txt.includes('חביל')) return 'pack';
  if (txt.includes('carton') || txt.includes('קרטון') || txt.includes('קרטונ')) return 'carton';
  if (txt.includes('gallon') || txt.includes('גלון') || txt.includes('גלונ')) return 'gallon';
  if (txt.includes('bag') || txt.includes('שק')) return 'bag';
  if (txt.includes('can') || txt.includes('פחית') || txt.includes('קופסה')) return 'can';
  return 'unknown';
}

function totalMatchesUnitPrice(unitPrice: number, quantity: number, total: number): boolean {
  const expected = unitPrice * quantity;
  const tolerance = Math.max(0.05, Math.abs(expected) * 0.02);
  return Math.abs(total - expected) <= tolerance;
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
  // -1 means "merge all Excel sheets"
  if (Number.isFinite(n) && Math.floor(n) === -1) return -1;
  if (!Number.isFinite(n) || n < 0 || n >= sheetCount) return 0;
  return Math.floor(n);
}

function parseTableIndex(raw: unknown, tableCount: number): number {
  const n = Number(raw ?? 0);
  // -1 means "merge all PDF tables"
  if (Number.isFinite(n) && Math.floor(n) === -1) return -1;
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

function filterIgnoredRows(
  rows: unknown[][],
  ignoredRows: Set<number>,
  options?: { preserveHeaderRow?: boolean },
): unknown[][] {
  if (!ignoredRows.size) return rows;
  const preserveHeaderRow = options?.preserveHeaderRow === true;
  return rows.filter((_, idx) => {
    if (preserveHeaderRow && idx === 0) return true;
    return !ignoredRows.has(idx);
  });
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

function parseManualGlobalValues(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null || raw === '') return {};
  let input: unknown = raw;
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [fieldKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = String(fieldKey || '').trim();
    const value = String(rawValue ?? '').trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function normalizePdfCellText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/([^\s(])\(/g, '$1 (')
    .replace(/\)([^\s)])/g, ') $1')
    .replace(/([ךםןףץ])([א-ת])/g, '$1 $2')
    .replace(/([א-ת])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([א-ת])/g, '$1 $2')
    .replace(/(\d)([A-Za-z\u0590-\u05FF₪])/g, '$1 $2')
    .replace(/([A-Za-z\u0590-\u05FF₪])(\d)/g, '$1 $2')
    .replace(/(₪)([A-Za-z\u0590-\u05FF])/g, '$1 $2')
    .replace(/(ק["״']?ג)(?=[א-ת])/g, '$1 ')
    .replace(/(ליטר)(?=[א-ת])/g, '$1 ')
    .replace(/(יחידות?)(?=[א-ת])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFirstNumberFromText(raw: unknown): number | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ');
  const m = text.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const normalized = m[0].replace(/,/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function detectPackageTypeFromText(rawA: unknown, rawB: unknown): PackageType {
  const txt = `${String(rawA ?? '')} ${String(rawB ?? '')}`.toLowerCase();
  if (txt.includes('שקית') || txt.includes('שקיו') || txt.includes('sachet')) return 'sachet';
  if (txt.includes('בקבוק') || txt.includes('בקבוקי') || txt.includes('bottle')) return 'bottle';
  if (txt.includes('שרינק') || txt.includes('shrink')) return 'shrink';
  if (txt.includes('חבילה') || txt.includes('מארז') || txt.includes('pack')) return 'pack';
  if (txt.includes('גלון') || txt.includes('gallon')) return 'gallon';
  if (txt.includes('קרטון') || txt.includes('קרטונ') || txt.includes('carton')) return 'carton';
  if (txt.includes('שק') || txt.includes('bag')) return 'bag';
  if (txt.includes('פח') || txt.includes('פחית') || txt.includes('can')) return 'can';
  if (txt.includes('גליל') || txt.includes('roll')) return 'roll';
  return 'unknown';
}

function detectPricingUnitFromPriceText(raw: unknown): 'kg' | 'liter' | 'unit' {
  const txt = String(raw ?? '').toLowerCase();
  if (txt.includes('לקילוגרם') || txt.includes('לק"ג') || txt.includes('לקג') || txt.includes('/kg')) return 'kg';
  if (txt.includes('לליטר') || txt.includes('/liter') || txt.includes('/l')) return 'liter';
  return 'unit';
}

function parsePricingUnit(raw: unknown): 'unit' | 'kg' | 'liter' | null {
  const txt = String(raw ?? '').trim().toLowerCase();
  if (!txt) return null;
  if (['kg', 'קג', 'ק"ג', 'קילו', 'קילוגרם', 'kilogram'].some((t) => txt.includes(t))) return 'kg';
  if (['liter', 'litre', 'ליטר', 'ל', 'ל.'].some((t) => txt === t || txt.includes(t))) return 'liter';
  if (['unit', 'יחידה', 'יח', 'piece', 'pcs', 'pc', 'דף', 'דפים', 'קרטון', 'פח', 'גליל'].some((t) => txt.includes(t))) return 'unit';
  return null;
}

function detectPriceUomLabel(raw: unknown): string {
  const txt = String(raw ?? '').toLowerCase();
  if (txt.includes('לקילוגרם') || txt.includes('לק"ג') || txt.includes('לקג')) return 'ק"ג';
  if (txt.includes('לליטר')) return 'ליטר';
  if (txt.includes('לדף')) return 'דפים';
  if (txt.includes('לקרטון')) return 'קרטון';
  if (txt.includes('לגליל')) return 'גליל';
  if (txt.includes('לפח')) return 'פח';
  return 'יחידה';
}

function detectPackageQuantityFromText(rawA: unknown, rawB?: unknown): number | null {
  const txt = `${String(rawA ?? '')} ${String(rawB ?? '')}`.replace(/\s+/g, ' ').trim();
  if (!txt) return null;

  const patterns: RegExp[] = [
    /\(\s*א[.\-]?\s*(\d+(?:[.,]\d+)?)\b/u,
    /ארוז\s*(\d+(?:[.,]\d+)?)\b/u,
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:[.,]\d+)?)\s*(?:ק["״']?ג|קג|קילו|קילוגרם|ליטר|יחידות?|יחידה|גלון|שק(?:ים)?|בקבוק(?:ים)?|קרטונ(?:ים)?|מארז(?:ים)?|חביל(?:ה|ות)|פח(?:ים)?|דפים?)(?:\s|$)/iu,
  ];

  for (const re of patterns) {
    const m = txt.match(re);
    if (!m) continue;
    const num = Number(String(m[1]).replace(',', '.'));
    if (Number.isFinite(num) && num > 0) return num;
  }

  return null;
}

function buildRowSearchText(row: unknown[]): string {
  if (!Array.isArray(row) || row.length === 0) return '';
  return row
    .map((cell) => normalizePdfCellText(cell))
    .filter((part) => part.trim().length > 0)
    .join(' ');
}

function logImportCalcDebug(event: string, payload: Record<string, unknown>): void {
  console.log(`[import-calc] ${event}`, payload);
}

function buildPdfDerivedRows(rows: unknown[][]): unknown[][] {
  if (!rows.length) return rows;
  const header = (rows[0] || []).map((c) => normalizePdfCellText(c));
  const tokenToIndex = new Map<string, number>();
  header.forEach((h, idx) => tokenToIndex.set(cleanHeaderToken(h), idx));

  const findColumn = (...tests: string[]): number => {
    for (const test of tests) {
      const t = cleanHeaderToken(test);
      for (const [headerToken, idx] of tokenToIndex.entries()) {
        if (headerToken.includes(t)) return idx;
      }
    }
    return -1;
  };

  const codeIdx = findColumn('קוד פריט', 'קודפריט', 'item code');
  const descIdx = findColumn('תאור', 'תיאור', 'description');
  const packagesIdx = findColumn('כמות אריזות', 'כמותאריזות');
  const qtyPerPackageIdx = findColumn('כמות לתמחור באריזה', 'כמותלתמחורבאריזה');
  const pricingQtyIdx = findColumn('כמות לתמחור', 'כמותלתמחור');
  const priceIdx = findColumn('מחיר', 'price');
  const lineTotalIdx = findColumn('סהכ', 'סה"כ', 'סך הכל', 'total');

  const derivedHeader = [
    'packages_count',
    'package_type_derived',
    'package_quantity_derived',
    'pricing_unit_derived',
    'price_uom_label_derived',
    'unit_price_derived',
    'total_pricing_qty_derived',
    'line_total_derived',
    'expected_total_derived',
    'confidence_derived',
    'line_warnings_derived',
  ];

  const output: unknown[][] = [[...header, ...derivedHeader]];
  for (const rawRow of rows.slice(1)) {
    const row = Array.isArray(rawRow) ? rawRow.map((c) => normalizePdfCellText(c)) : [];
    const code = codeIdx >= 0 ? String(row[codeIdx] || '').trim() : '';
    const desc = descIdx >= 0 ? String(row[descIdx] || '').trim() : '';
    const packagesRaw = packagesIdx >= 0 ? row[packagesIdx] : '';
    const qtyPerPackageRaw = qtyPerPackageIdx >= 0 ? row[qtyPerPackageIdx] : '';
    const pricingQtyRaw = pricingQtyIdx >= 0 ? row[pricingQtyIdx] : '';
    const priceRaw = priceIdx >= 0 ? row[priceIdx] : '';
    const lineTotalRaw = lineTotalIdx >= 0 ? row[lineTotalIdx] : '';

    const summaryRow = /סה["']?\s*כ/i.test(`${desc} ${packagesRaw} ${lineTotalRaw}`);
    if (!code || summaryRow) continue;

    const packagesCount = parseFirstNumberFromText(packagesRaw);
    const packageType = detectPackageTypeFromText(packagesRaw, qtyPerPackageRaw);
    const qtyPerPackage = parseFirstNumberFromText(qtyPerPackageRaw);
    const pricingUnit = detectPricingUnitFromPriceText(priceRaw);
    const priceUomLabel = detectPriceUomLabel(priceRaw);
    const unitPrice = parseFirstNumberFromText(priceRaw);
    let totalPricingQty = parseFirstNumberFromText(pricingQtyRaw);
    if (totalPricingQty === null && packagesCount !== null && qtyPerPackage !== null) {
      totalPricingQty = packagesCount * qtyPerPackage;
    }
    const lineTotal = parseFirstNumberFromText(lineTotalRaw);
    const expectedTotal = unitPrice !== null && totalPricingQty !== null ? unitPrice * totalPricingQty : null;
    const matched =
      expectedTotal !== null && lineTotal !== null
        ? totalMatchesUnitPrice(unitPrice || 0, totalPricingQty || 0, lineTotal)
        : null;
    const confidence =
      unitPrice !== null && totalPricingQty !== null && lineTotal !== null
        ? (matched ? 'high' : 'low')
        : (unitPrice !== null && (qtyPerPackage !== null || totalPricingQty !== null) ? 'medium' : 'low');
    const lineWarnings: string[] = [];
    if (packageType === 'unknown') lineWarnings.push('missing package_type');
    if (qtyPerPackage === null || qtyPerPackage <= 0) lineWarnings.push('missing qty_per_package');

    output.push([
      ...row,
      packagesCount ?? '',
      packageType,
      qtyPerPackage ?? '',
      pricingUnit,
      priceUomLabel,
      unitPrice ?? '',
      totalPricingQty ?? '',
      lineTotal ?? '',
      expectedTotal !== null ? Number(expectedTotal.toFixed(4)) : '',
      confidence,
      lineWarnings.join('; '),
    ]);
  }

  return output;
}

function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'buffer', raw: false });
}

function rowsFromSheet(workbook: XLSX.WorkBook, sheetIndex: number): unknown[][] {
  const safeSheetIndex = parseSheetIndex(sheetIndex, workbook.SheetNames.length);
  if (safeSheetIndex === -1) return [];
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

function rowsFromAllSheets(workbook: XLSX.WorkBook, hasHeader: boolean): unknown[][] {
  return workbook.SheetNames.reduce<unknown[][]>((acc, _sheetName, index) => {
    const sheetRows = rowsFromSheet(workbook, index);
    if (!sheetRows.length) return acc;
    if (!acc.length) return [...sheetRows];
    if (!hasHeader) return [...acc, ...sheetRows];
    // Keep only one header row when combining multiple sheets.
    return [...acc, ...sheetRows.slice(1)];
  }, []);
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
    { field: 'product_name', tests: ['product name', 'product', 'מוצר', 'שם מוצר', 'תאור', 'תיאור', 'description'] },
    { field: 'sku', tests: ['sku', 'מקט', 'מק ט', 'barcode sku', 'קוד פריט', 'קודפריט', 'item code'] },
    { field: 'barcode', tests: ['barcode', 'ברקוד'] },
    { field: 'category', tests: ['category', 'קטגוריה'] },
    {
      field: 'package_quantity',
      tests: ['package quantity', 'qty per package','כמות לתמחור באריזה','כמות לתמחור', 'package_quantity_derived'],
    },
    { field: 'package_type', tests: ['package type', 'packaging type', 'סוג אריזה', 'כמות אריזות', 'package_type_derived'] },
    { field: 'pricing_unit', tests: ['pricing unit', 'סוג יחידה', 'יחידת תמחור', 'pricing_unit_derived'] },
    { field: 'supplier', tests: ['supplier', 'ספק'] },
    { field: 'price', tests: ['price', 'מחיר', 'cost', 'עלות', 'unit_price_derived'] },
    { field: 'line_total', tests: ['total', 'סהכ', 'סה"כ', 'סך הכל', 'line_total_derived'] },
    { field: 'source_price_includes_vat', tests: ['includes vat', 'כולל מעמ', 'כולל מע"מ', 'source_price_includes_vat'] },
    { field: 'vat_rate', tests: ['vat rate', 'שיעור מעמ', 'אחוז מעמ', 'אחוז מע"מ', 'vat_rate'] },
    { field: 'effective_from', tests: ['effective from', 'תוקף מ', 'תאריך תחילה', 'מתאריך', 'effective_from'] },
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
  options?: {
    manualSupplierName?: string;
    manualValuesByRow?: Map<number, Record<string, string>>;
    manualGlobalValues?: Record<string, string>;
    sourceType?: 'excel' | 'pdf';
  },
): {
  rows: ImportRow[];
  rowErrors: RowError[];
  unimportedProducts: UnimportedProduct[];
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
  const unimportedProducts: UnimportedProduct[] = [];
  const normalizedRows: ImportRow[] = [];
  const normalizedIndexesBySourceRow = new Map<number, number[]>();
  const manualSupplier = (options?.manualSupplierName || '').trim();
  const manualValuesByRow = options?.manualValuesByRow || new Map<number, Record<string, string>>();
  const manualGlobalValues = options?.manualGlobalValues || {};
  const isPdfSource = options?.sourceType === 'pdf';
  const isExcelSource = options?.sourceType !== 'pdf';
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
  const packageTypeCol = getMappedColumn(mapping, 'package_type');
  const pricingUnitCol = getMappedColumn(mapping, 'pricing_unit');
  const lineTotalCol = getMappedColumn(mapping, 'line_total');
  const sourcePriceIncludesVatCol = getMappedColumn(mapping, 'source_price_includes_vat');
  const vatRateCol = getMappedColumn(mapping, 'vat_rate');
  const effectiveFromCol = getMappedColumn(mapping, 'effective_from');
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

  const pairDefsRaw = pairIndexes.map((index) => ({
    index,
    supplierCol: getMappedColumn(mapping, `supplier_${index}`, index === 1 ? 'supplier' : ''),
    priceCol: getMappedColumn(mapping, `price_${index}`, index === 1 ? 'price' : ''),
    discountCol: getMappedColumn(mapping, `discount_percent_${index}`, index === 1 ? 'discount_percent' : ''),
    vatCol: getMappedColumn(mapping, `vat_${index}`),
    currencyCol: getMappedColumn(mapping, `currency_${index}`),
  }));
  const pairDefs = pairDefsRaw.filter((pair, idx, arr) => {
    const sig = `${pair.supplierCol ?? ''}|${pair.priceCol ?? ''}|${pair.discountCol ?? ''}|${pair.vatCol ?? ''}|${pair.currencyCol ?? ''}`;
    return idx === arr.findIndex((candidate) => {
      const candidateSig =
        `${candidate.supplierCol ?? ''}|${candidate.priceCol ?? ''}|${candidate.discountCol ?? ''}|` +
        `${candidate.vatCol ?? ''}|${candidate.currencyCol ?? ''}`;
      return candidateSig === sig;
    });
  });

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
      unimportedProducts,
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
    const manualText = (fieldKey: string): string => {
      const rowValue = String(manualRow[fieldKey] ?? '').trim();
      if (rowValue) return rowValue;
      return String(manualGlobalValues[fieldKey] ?? '').trim();
    };
    const manualNumber = (fieldKey: string): number | null => parseNumberSmart(manualText(fieldKey));

    // Excel compatibility: if a row has only supplier value, treat it as supplier continuation
    // for the previous product row (instead of importing this row as a product).
    if (isExcelSource) {
      const productNameCandidate = manualText('product_name') || toCellString(row, productCol);
      const skuCandidate = manualText('sku') || toCellString(row, skuCol);
      const barcodeCandidate = manualText('barcode') || toCellString(row, barcodeCol);
      const categoryCandidate = manualText('category') || toCellString(row, categoryCol);
      const packageQtyCandidate = manualText('package_quantity') || toCellString(row, packageQtyCol);
      const packageTypeCandidate = manualText('package_type') || toCellString(row, packageTypeCol);
      const pricingUnitCandidate = manualText('pricing_unit') || toCellString(row, pricingUnitCol);
      const lineTotalCandidate = manualText('line_total') || toCellString(row, lineTotalCol);

      const rowSuppliers: string[] = [];
      let hasAnyPriceValue = false;
      for (const pair of pairDefs) {
        const supplierCandidate =
          manualText(`supplier_${pair.index}`) || (pair.index === 1 ? manualText('supplier') : '') || toCellString(row, pair.supplierCol);
        const priceCandidate =
          manualText(`price_${pair.index}`) || (pair.index === 1 ? manualText('price') : '') || toCellString(row, pair.priceCol);
        if (supplierCandidate) rowSuppliers.push(supplierCandidate);
        if (priceCandidate) hasAnyPriceValue = true;
      }

      const firstSupplierOnly = rowSuppliers.find((s) => !!String(s || '').trim()) || '';
      const hasAnyNonSupplierValue = !!(
        productNameCandidate ||
        skuCandidate ||
        barcodeCandidate ||
        categoryCandidate ||
        packageQtyCandidate ||
        packageTypeCandidate ||
        pricingUnitCandidate ||
        lineTotalCandidate ||
        hasAnyPriceValue
      );

      const isSupplierOnlyRow = !!firstSupplierOnly && !hasAnyNonSupplierValue;
      if (isSupplierOnlyRow) {
        const prevRowIndexes = normalizedIndexesBySourceRow.get(visualRow - 1) || [];
        for (const idx of prevRowIndexes) {
          normalizedRows[idx].supplier = firstSupplierOnly;
        }
        continue;
      }
    }

    const productNameRaw = manualText('product_name') || toCellString(row, productCol);
    const productName = isPdfSource ? normalizeImportedProductName(productNameRaw) : productNameRaw;
    if (!productName) {
      rowErrors.push({ row: visualRow, message: 'שם מוצר חסר - שורה דולגה' });
      unimportedProducts.push({ row: visualRow, productName: '', reason: 'שם מוצר חסר' });
      continue;
    }

    const sku = manualText('sku') || toCellString(row, skuCol) || undefined;
    const barcode = manualText('barcode') || toCellString(row, barcodeCol) || undefined;
    const category = manualText('category') || toCellString(row, categoryCol) || 'כללי';
    const packageQtyText = manualText('package_quantity') || toCellString(row, packageQtyCol);
    const packageQtyRaw = manualNumber('package_quantity') ?? toCellNumber(row, packageQtyCol);
    const packageTypeRaw = manualText('package_type') || toCellString(row, packageTypeCol);
    const pricingUnitRaw = manualText('pricing_unit') || toCellString(row, pricingUnitCol);
    const rowSearchText = buildRowSearchText(row);
    const lineTotalRaw = manualNumber('line_total') ?? toCellNumber(row, lineTotalCol);
    const sourcePriceIncludesVat =
      parseBooleanSmart(manualText('source_price_includes_vat')) ??
      parseBooleanSmart(toCellString(row, sourcePriceIncludesVatCol));
    const vatRateRaw = manualNumber('vat_rate') ?? toCellNumber(row, vatRateCol);
    const effectiveFrom = parseDateSmart(manualText('effective_from') || toCellString(row, effectiveFromCol));
    const sharedDiscountRaw = manualNumber('discount_percent') ?? toCellNumber(row, sharedDiscountCol);
    const sharedVatRaw = manualNumber('vat') ?? toCellNumber(row, sharedVatCol);
    const sharedCurrency = manualText('currency') || toCellString(row, sharedCurrencyCol) || undefined;
    const packageTypeFromPreferred = normalizePackageType(packageTypeRaw, `${productName} ${packageQtyText}`);
    const packageTypeFromUnitField = normalizePackageType(pricingUnitRaw, `${productName} ${packageQtyText}`);
    const packageType =
      packageTypeFromPreferred !== 'unknown'
        ? packageTypeFromPreferred
        : packageTypeFromUnitField !== 'unknown'
          ? packageTypeFromUnitField
          : normalizePackageType(rowSearchText, `${productName} ${packageQtyText}`);
    const defaultPricingUnit =
      parsePricingUnit(pricingUnitRaw) ||
      parsePricingUnit(packageTypeRaw) ||
      parsePricingUnit(packageQtyText) ||
      parsePricingUnit(productName) ||
      parsePricingUnit(rowSearchText);

    let packageQty: number | undefined;
    const inferredPackageQty =
      detectPackageQuantityFromText(packageQtyText, productName) ??
      detectPackageQuantityFromText(rowSearchText, `${packageQtyText} ${productName}`);
    const effectivePackageQtyRaw = packageQtyRaw ?? inferredPackageQty;
    if (isPdfSource) {
      logImportCalcDebug('row_normalized', {
        row: visualRow,
        productName,
        sku,
        packageQtyText,
        packageQtyRaw,
        inferredPackageQty,
        effectivePackageQtyRaw,
        packageTypeRaw,
        packageType,
        pricingUnitRaw,
        defaultPricingUnit: defaultPricingUnit ?? 'unit',
        lineTotalRaw,
      });
    }
    if (effectivePackageQtyRaw !== null) {
      if (effectivePackageQtyRaw > 0) packageQty = effectivePackageQtyRaw;
      else {
        logImportCalcDebug('invalid_package_qty', {
          row: visualRow,
          productName,
          packageQtyText,
          effectivePackageQtyRaw,
        });
        rowErrors.push({ row: visualRow, message: 'כמות באריזה חייבת להיות מספר חיובי (או ריק)' });
      }
    }

    if (sharedDiscountRaw !== null && (sharedDiscountRaw < 0 || sharedDiscountRaw > 100)) {
      rowErrors.push({ row: visualRow, message: 'אחוז הנחה חייב להיות בין 0 ל-100' });
    }

    let mappedPairs = 0;
    const emittedPairSignatures = new Set<string>();
    for (const pair of pairDefs) {
      const manualSupplierForPair = manualText(`supplier_${pair.index}`) || (pair.index === 1 ? manualText('supplier') : '');
      const manualPriceForPair = manualText(`price_${pair.index}`) || (pair.index === 1 ? manualText('price') : '');
      const manualDiscountForPair = manualNumber(`discount_percent_${pair.index}`) ?? (pair.index === 1 ? manualNumber('discount_percent') : null);
      const manualVatForPair = manualNumber(`vat_${pair.index}`) ?? (pair.index === 1 ? manualNumber('vat') : null);
      const manualCurrencyForPair = manualText(`currency_${pair.index}`) || (pair.index === 1 ? manualText('currency') : '');

      if (pair.priceCol === null && !manualPriceForPair) continue;

      // Priority: explicit row override -> mapped supplier from file -> global fixed supplier fallback.
      const supplier = manualSupplierForPair || toCellString(row, pair.supplierCol) || manualSupplier;
      const priceRaw = manualPriceForPair || toCellString(row, pair.priceCol);
      const pricingUnit = defaultPricingUnit || detectPricingUnitFromPriceText(priceRaw) || 'unit';

      // fallback rule: partial pair -> skip this pair only
      if (!priceRaw) continue;
      if (!supplier) {
        logImportCalcDebug('missing_supplier', {
          row: visualRow,
          pair: pair.index,
          productName,
          priceRaw,
        });
        rowErrors.push({ row: visualRow, message: `ספק חסר בזוג #${pair.index} (או הגדר ספק קבוע לכל הקובץ)` });
        continue;
      }

      const priceNum = parseNumberSmart(priceRaw) ?? parseFirstNumberFromText(priceRaw);
      if (priceNum === null || priceNum <= 0) {
        logImportCalcDebug('invalid_price', {
          row: visualRow,
          pair: pair.index,
          productName,
          supplier,
          priceRaw,
          parsedPrice: priceNum,
        });
        rowErrors.push({ row: visualRow, message: `מחיר לא תקין בזוג ספק/מחיר #${pair.index}` });
        continue;
      }

      if (effectivePackageQtyRaw !== null && effectivePackageQtyRaw <= 0) {
        logImportCalcDebug('invalid_package_qty_for_pair', {
          row: visualRow,
          pair: pair.index,
          productName,
          supplier,
          priceNum,
          effectivePackageQtyRaw,
        });
        rowErrors.push({ row: visualRow, message: 'כמות באריזה חייבת להיות גדולה מ-0' });
        continue;
      }

      if (
        isPdfSource &&
        lineTotalRaw !== null &&
        effectivePackageQtyRaw !== null &&
        !totalMatchesUnitPrice(priceNum, effectivePackageQtyRaw, lineTotalRaw)
      ) {
        logImportCalcDebug('line_total_mismatch', {
          row: visualRow,
          pair: pair.index,
          productName,
          supplier,
          unitPrice: priceNum,
          quantity: effectivePackageQtyRaw,
          lineTotal: lineTotalRaw,
          expected: Number((priceNum * (effectivePackageQtyRaw || 0)).toFixed(4)),
        });
        rowErrors.push({ row: visualRow, message: `סה"כ שורה לא תואם מחיר*כמות בזוג #${pair.index}` });
      }

      const pairDiscountRaw = manualDiscountForPair ?? toCellNumber(row, pair.discountCol);
      const discountPercent = pairDiscountRaw ?? sharedDiscountRaw ?? 0;
      if (discountPercent < 0 || discountPercent > 100) {
        rowErrors.push({ row: visualRow, message: `אחוז הנחה לא תקין בזוג #${pair.index}` });
        continue;
      }

      const pairVat = manualVatForPair ?? toCellNumber(row, pair.vatCol) ?? sharedVatRaw ?? undefined;
      const pairCurrency = manualCurrencyForPair || toCellString(row, pair.currencyCol) || sharedCurrency;

      const pairSignature =
        `${normKey(supplier)}|${priceNum}|${discountPercent}|${pairVat ?? ''}|${pairCurrency ?? ''}|` +
        `${packageQty ?? ''}|${pricingUnit}|${packageType}`;
      if (emittedPairSignatures.has(pairSignature)) {
        logImportCalcDebug('duplicate_pair_skipped', {
          row: visualRow,
          pair: pair.index,
          productName,
          supplier,
          priceNum,
        });
        continue;
      }
      emittedPairSignatures.add(pairSignature);
      normalizedRows.push({
        product_name: productName,
        supplier,
        price: priceNum,
        source_row: visualRow,
        category,
        sku,
        barcode,
        package_quantity: packageQty,
        discount_percent: discountPercent,
        vat: pairVat ?? undefined,
        currency: pairCurrency ?? undefined,
        package_type: PACKAGE_TYPES.includes(packageType) ? packageType : 'unknown',
        pricing_unit: pricingUnit,
        source_price_includes_vat: sourcePriceIncludesVat ?? false,
        vat_rate: vatRateRaw ?? undefined,
        effective_from: effectiveFrom ?? undefined,
      });
      const pushedIdx = normalizedRows.length - 1;
      const bySource = normalizedIndexesBySourceRow.get(visualRow) || [];
      bySource.push(pushedIdx);
      normalizedIndexesBySourceRow.set(visualRow, bySource);
      mappedPairs += 1;
      logImportCalcDebug('pair_mapped', {
        row: visualRow,
        pair: pair.index,
        productName,
        supplier,
        priceNum,
        discountPercent,
        packageQty: packageQty ?? null,
        packageType,
        pricingUnit,
      });
    }

    if (mappedPairs === 0) {
      rowErrors.push({ row: visualRow, message: 'לא נמצא זוג ספק/מחיר תקין בשורה' });
      unimportedProducts.push({ row: visualRow, productName, reason: 'לא נמצא זוג ספק/מחיר תקין בשורה' });
    }
  }

  const suppliers = new Set(normalizedRows.map((r) => normKey(r.supplier)).filter(Boolean));
  const categories = new Set(normalizedRows.map((r) => normKey(r.category || 'כללי')).filter(Boolean));
  const products = new Set(normalizedRows.map((r) => normalizeName(r.product_name)).filter(Boolean));

  return {
    rows: normalizedRows,
    rowErrors,
    unimportedProducts,
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

function dedupeLastRowWins(rows: ImportRow[]): { rows: ImportRow[]; dropped: UnimportedProduct[] } {
  const seen = new Map<string, ImportRow>();
  const dropped: UnimportedProduct[] = [];
  for (const row of rows) {
    const key =
      `${normalizeName(row.product_name)}|` +
      `${normKey(row.supplier)}|` +
      `${normKey(row.category || 'כללי')}|` +
      `${skuKey(row.sku)}|` +
      `${skuKey(row.barcode)}`;
    const previous = seen.get(key);
    if (previous) {
      dropped.push({
        row: previous.source_row ?? 0,
        productName: previous.product_name,
        reason: 'כפילות בקובץ - נשמרה ההופעה האחרונה',
      });
    }
    seen.set(key, row);
  }
  return { rows: Array.from(seen.values()), dropped };
}

type SourceRowsResult = {
  sourceType: 'excel' | 'pdf';
  rows: unknown[][];
  selectedSheet?: number;
  previewPage?: number;
  previewPageSize?: number;
  previewTotalRows?: number;
  previewTotalPages?: number;
  sampleRowOffset?: number;
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
    let extractPdfTablesWithTextract: PdfExtractorModule['extractPdfTablesWithTextract'];
    try {
      ({ extractPdfTablesWithTextract } = await loadPdfExtractorModule());
    } catch (error) {
      console.error('Failed to load PDF extractor module:', error);
      throw new Error('PDF import is temporarily unavailable on server');
    }
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
    const rows =
      selectedTableIndex === -1
        ? extracted.tables.reduce<unknown[][]>((acc, table, idx) => {
            const normalizedRows = buildPdfDerivedRows(table.rows);
            if (!normalizedRows.length) return acc;
            if (idx === 0) return [...normalizedRows];
            // Keep only the first table header row when combining.
            return [...acc, ...normalizedRows.slice(1)];
          }, [])
        : buildPdfDerivedRows(extracted.tables[selectedTableIndex].rows);

    const pdfTables = extracted.tables.map((table) => {
      const normalizedRows = buildPdfDerivedRows(table.rows);
      const columns = buildColumns(normalizedRows, hasHeader);
      const sampleRows = normalizedRows.slice(0, 50).map((row) =>
        Array.from({ length: columns.length }).map((_, idx) => {
          const value = row[idx];
          if (typeof value === 'string' || typeof value === 'number' || value === null) return value;
          return value === undefined ? '' : String(value);
        }),
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

  const hasHeader = parseBooleanFlag(body?.hasHeader, true);
  const selectedSheet = parseSheetIndex(body?.sheetIndex, workbook.SheetNames.length);
  const rows = selectedSheet === -1 ? rowsFromAllSheets(workbook, hasHeader) : rowsFromSheet(workbook, selectedSheet);
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
    const requestedPageSize = parsePositiveInt(req.body?.previewPageSize) ?? 50;
    const previewPageSize = Math.min(200, Math.max(1, requestedPageSize));
    const requestedPage = parsePositiveInt(req.body?.previewPage) ?? 1;
    const dataStartIndex = hasHeader ? 1 : 0;
    const totalDataRows = Math.max(0, rows.length - dataStartIndex);
    const previewTotalPages = Math.max(1, Math.ceil(totalDataRows / previewPageSize));
    const previewPage = Math.min(Math.max(1, requestedPage), previewTotalPages);
    const dataOffset = (previewPage - 1) * previewPageSize;
    const sampleRowOffset = dataStartIndex + dataOffset;
    const previewRows = rows.slice(sampleRowOffset, sampleRowOffset + previewPageSize);

    const sampleRows = previewRows.map((row) =>
      Array.from({ length: columns.length }).map((_, idx) => row[idx] ?? ''),
    );
    const suggestedMapping = suggestMapping(columns);

    return res.json({
      sourceType: source.sourceType,
      sheets: source.sheets || [],
      selectedSheet: source.selectedSheet ?? 0,
      previewPage,
      previewPageSize,
      previewTotalRows: totalDataRows,
      previewTotalPages,
      sampleRowOffset,
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
    const manualGlobalValues = parseManualGlobalValues(req.body?.manualGlobalValues);

    const isIgnoredVisualRow = (visualRow: number) => ignoredRows.has(Math.max(0, visualRow - 1));
    const normalizedRaw = normalizeRowsWithMapping(source.rows, hasHeader, mapping, {
      manualSupplierName,
      manualValuesByRow,
      manualGlobalValues,
      sourceType: source.sourceType,
    });
    const normalized = {
      ...normalizedRaw,
      rows: normalizedRaw.rows.filter((r) => !isIgnoredVisualRow(r.source_row ?? 0)),
      rowErrors: normalizedRaw.rowErrors.filter((e) => !isIgnoredVisualRow(e.row)),
      unimportedProducts: normalizedRaw.unimportedProducts.filter((u) => !isIgnoredVisualRow(u.row)),
      statsEstimate: {
        ...normalizedRaw.statsEstimate,
        mappedRows: normalizedRaw.rows.filter((r) => !isIgnoredVisualRow(r.source_row ?? 0)).length,
        skippedRows: Math.max(
          0,
          normalizedRaw.statsEstimate.totalInputRows -
            normalizedRaw.rows.filter((r) => !isIgnoredVisualRow(r.source_row ?? 0)).length,
        ),
      },
    };

    return res.json({
      sourceType: source.sourceType,
      selectedTableIndex: source.selectedTableIndex ?? 0,
      selectedSheet: source.selectedSheet ?? 0,
      fieldErrors: normalized.fieldErrors,
      rowErrors: normalized.rowErrors,
      unimportedProducts: normalized.unimportedProducts,
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
    const manualGlobalValues = parseManualGlobalValues(req.body?.manualGlobalValues);

    const rowsBeforeIgnored = Math.max(0, source.rows.length - (hasHeader ? 1 : 0));
    const rowsAfterIgnored = Math.max(0, rowsBeforeIgnored - ignoredRows.size);
    const ignoredRowsCount = Math.max(0, rowsBeforeIgnored - rowsAfterIgnored);
    const isIgnoredVisualRow = (visualRow: number) => ignoredRows.has(Math.max(0, visualRow - 1));
    const normalizedRaw = normalizeRowsWithMapping(source.rows, hasHeader, mapping, {
      manualSupplierName,
      manualValuesByRow,
      manualGlobalValues,
      sourceType: source.sourceType,
    });
    const normalized = {
      ...normalizedRaw,
      rows: normalizedRaw.rows.filter((r) => !isIgnoredVisualRow(r.source_row ?? 0)),
      rowErrors: normalizedRaw.rowErrors.filter((e) => !isIgnoredVisualRow(e.row)),
      unimportedProducts: normalizedRaw.unimportedProducts.filter((u) => !isIgnoredVisualRow(u.row)),
      statsEstimate: {
        ...normalizedRaw.statsEstimate,
        mappedRows: normalizedRaw.rows.filter((r) => !isIgnoredVisualRow(r.source_row ?? 0)).length,
        skippedRows: Math.max(
          0,
          normalizedRaw.statsEstimate.totalInputRows -
            normalizedRaw.rows.filter((r) => !isIgnoredVisualRow(r.source_row ?? 0)).length,
        ),
      },
    };

    if (normalized.fieldErrors.length) {
      return res.status(400).json({ error: normalized.fieldErrors.join('\n') });
    }
    if (!normalized.rows.length) {
      return res.status(400).json({
        error: 'לא נמצאו שורות תקינות לייבוא אחרי המיפוי',
        rowErrors: normalized.rowErrors,
        unimportedProducts: normalized.unimportedProducts,
      });
    }

    // last row wins for same product+supplier+category in the same file
    const dedupeResult = dedupeLastRowWins(normalized.rows);
    const rows = dedupeResult.rows;
    const unimportedProducts = [...normalized.unimportedProducts, ...dedupeResult.dropped];

    // Get settings for VAT, margin, use_margin, and use_vat
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('vat_percent,global_margin_percent,use_margin,use_vat,decimal_precision')
      .eq('tenant_id', tenant.tenantId)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
    }

    const vatPercent = settings?.vat_percent || 18;
    const globalMarginPercent = settings?.global_margin_percent ?? 0;
    const useMargin = settings?.use_margin === true;
    const useVat = settings?.use_vat === true;
    const decimalPrecision = clampDecimalPrecision((settings as any)?.decimal_precision, 2);

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
        use_vat: false,
        decimal_precision: 2,
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
      pricingUnit?: 'unit' | 'kg' | 'liter';
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
        pricingUnit: r.pricing_unit || 'unit',
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
      pricingUnit?: 'unit' | 'kg' | 'liter';
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
        if (existing.pricingUnit === 'unit' && p.pricingUnit && p.pricingUnit !== 'unit') existing.pricingUnit = p.pricingUnit;
      }
    }

    const missingProductRows = Array.from(desiredProducts.entries())
      .filter(([key]) => !productIdByKey.has(key))
      .map(([, v]) => ({
        tenant_id: tenant.tenantId,
        name: v.name,
        name_norm: v.nameNorm,
        category_id: v.categoryId,
        unit: v.pricingUnit || 'unit',
        sku: v.sku ?? null,
        package_quantity: roundToPrecision(v.packageQty ?? 1, decimalPrecision),
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
      if (!supplierId) {
        logImportCalcDebug('apply_skip_missing_supplier_id', {
          row: r.source_row ?? null,
          productName: r.product_name,
          supplier: r.supplier,
        });
        stats.pricesSkipped++;
        continue;
      }

      const categoryName = (r.category && r.category.trim()) ? r.category.trim() : 'כללי';
      const categoryId = categoryIdByName.get(normKey(categoryName)) || defaultCategoryId;
      const nameNorm = normalizeName(r.product_name);
      const pId = productIdByKey.get(productKey(nameNorm, categoryId, r.sku || null));
      if (!pId) {
        logImportCalcDebug('apply_skip_missing_product_id', {
          row: r.source_row ?? null,
          productName: r.product_name,
          sku: r.sku ?? null,
          supplier: r.supplier,
        });
        stats.pricesSkipped++;
        continue;
      }

      const roundedPrice = roundToPrecision(r.price, decimalPrecision);
      const discountPercent = roundToPrecision(r.discount_percent ?? 0, decimalPrecision);
      const costAfterDiscount = calcCostAfterDiscount(roundedPrice, discountPercent, decimalPrecision);
      const sellPrice = calcSellPrice({
        cost_price: roundedPrice,
        margin_percent: roundToPrecision(globalMarginPercent, decimalPrecision),
        vat_percent: vatPercent,
        cost_price_after_discount: costAfterDiscount,
        use_margin: useMargin,
        use_vat: useVat,
        precision: decimalPrecision,
      });
      logImportCalcDebug('apply_calculated_prices', {
        row: r.source_row ?? null,
        productName: r.product_name,
        supplier: r.supplier,
        costPrice: roundedPrice,
        discountPercent,
        costAfterDiscount,
        marginPercent: globalMarginPercent,
        vatPercent,
        useMargin,
        useVat,
        sellPrice,
        packageQty: r.package_quantity ?? 1,
        packageType: r.package_type ?? 'unknown',
        pricingUnit: r.pricing_unit ?? 'unit',
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
    const latestPriceByPair = new Map<
      string,
      {
        cost_price: number;
        discount_percent: number | null;
        sell_price: number;
        package_quantity: number | null;
        package_type: PackageType | null;
      }
    >();

    if (productIds.length && supplierIds.length) {
      const { data: prices, error: pricesErr } = await supabase
        .from('price_entries')
        .select('product_id,supplier_id,cost_price,discount_percent,sell_price,package_quantity,package_type,created_at')
        .eq('tenant_id', tenant.tenantId)
        .in('product_id', productIds)
        .in('supplier_id', supplierIds)
        .order('created_at', { ascending: false });

      let pricesRows = prices as Array<Record<string, any>> | null | undefined;
      if (pricesErr && isMissingExtendedPriceInsertColumns(pricesErr)) {
        const { data: legacyPrices, error: legacyErr } = await supabase
          .from('price_entries')
          .select('product_id,supplier_id,cost_price,discount_percent,sell_price,package_quantity,created_at')
          .eq('tenant_id', tenant.tenantId)
          .in('product_id', productIds)
          .in('supplier_id', supplierIds)
          .order('created_at', { ascending: false });
        if (legacyErr) {
          console.error('Error preloading prices (legacy fallback failed):', legacyErr);
          pricesRows = [];
        } else {
          pricesRows = legacyPrices as Array<Record<string, any>>;
        }
      } else if (pricesErr) {
        console.error('Error preloading prices:', pricesErr);
        pricesRows = [];
      }

      for (const p of (pricesRows || [])) {
        const key = `${p.product_id}||${p.supplier_id}`;
        if (!latestPriceByPair.has(key)) {
          latestPriceByPair.set(key, {
            cost_price: Number(p.cost_price),
            discount_percent: p.discount_percent === null ? null : Number(p.discount_percent),
            sell_price: Number(p.sell_price),
            package_quantity: p.package_quantity === null ? null : Number(p.package_quantity),
            package_type: (p.package_type as PackageType | null) ?? null,
          });
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
        Number(current.cost_price) === roundToPrecision(i.row.price, decimalPrecision) &&
        Number(current.discount_percent ?? 0) === i.discountPercent &&
        Number(current.sell_price) === i.sellPrice &&
        Number(current.package_quantity ?? 1) === roundToPrecision(Number(i.row.package_quantity ?? 1), decimalPrecision) &&
        (current.package_type ?? 'unknown') === (i.row.package_type ?? 'unknown');

      if (same) {
        stats.pricesSkipped++;
        continue;
      }

      priceRowsToInsert.push({
        tenant_id: tenant.tenantId,
        product_id: i.productId,
        supplier_id: i.supplierId,
        cost_price: roundToPrecision(i.row.price, decimalPrecision),
        discount_percent: i.discountPercent,
        cost_price_after_discount: roundToPrecision(i.costAfterDiscount, decimalPrecision),
        margin_percent: roundToPrecision(globalMarginPercent, decimalPrecision),
        sell_price: roundToPrecision(i.sellPrice, decimalPrecision),
        package_quantity: roundToPrecision(i.row.package_quantity ?? 1, decimalPrecision),
        package_type: i.row.package_type ?? 'unknown',
        source_price_includes_vat: i.row.source_price_includes_vat ?? false,
        vat_rate: i.row.vat_rate ?? null,
        effective_from: i.row.effective_from ?? null,
        created_by: user.id,
      });
    }

    for (const part of chunk(priceRowsToInsert, 500)) {
      const { error } = await supabase.from('price_entries').insert(part);
      if (!error) {
        stats.pricesInserted += part.length;
        continue;
      }

      if (isMissingExtendedPriceInsertColumns(error)) {
        const legacyPart = part.map((row) => {
          const { package_type, source_price_includes_vat, vat_rate, effective_from, ...legacyRow } = row;
          void package_type;
          void source_price_includes_vat;
          void vat_rate;
          void effective_from;
          return legacyRow;
        });

        const { error: legacyError } = await supabase.from('price_entries').insert(legacyPart as any);
        if (!legacyError) {
          stats.pricesInserted += part.length;
          continue;
        }

        console.error('Bulk price insert failed (legacy fallback failed):', legacyError);
        stats.pricesSkipped += part.length;
        continue;
      }

      console.error('Bulk price insert failed:', error);
      stats.pricesSkipped += part.length;
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
      rowErrors: normalized.rowErrors,
      unimportedProducts,
      importDiagnostics: {
        sourceRows: normalized.statsEstimate.totalInputRows,
        rowsBeforeIgnored,
        ignoredRowsCount,
        mappedRowsBeforeDedupe: normalized.rows.length,
        rowsAfterDedupe: rows.length,
        droppedInValidation: normalized.unimportedProducts.length,
        droppedAsDuplicates: dedupeResult.dropped.length,
      },
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

export const __testables = {
  parseSheetIndex,
  normalizeRowsWithMapping,
};

export default router;
