import {
  AnalyzeDocumentCommand,
  type Block,
  type Relationship,
  TextractClient,
} from '@aws-sdk/client-textract';
import { PDFParse } from 'pdf-parse';

export type PdfExtractOptions = {
  pageFrom?: number;
  pageTo?: number;
  maxPages?: number;
};

export type ExtractedPdfTable = {
  tableIndex: number;
  pageStart: number;
  pageEnd: number;
  rows: string[][];
};

export type ExtractedPdfResult = {
  tables: ExtractedPdfTable[];
  pagesDetected: number;
  warnings: string[];
};

type PdfDiagnostics = {
  version: string | null;
  pageCountEstimate: number | null;
  encrypted: boolean;
};

function extractPdfDiagnostics(pdfBytes: Buffer): PdfDiagnostics {
  const text = pdfBytes.toString('latin1');
  const versionMatch = text.match(/%PDF-(\d\.\d)/);
  const pageMatches = text.match(/\/Type\s*\/Page\b/g);
  const encrypted = /\/Encrypt\b/.test(text);
  return {
    version: versionMatch?.[1] || null,
    pageCountEstimate: pageMatches?.length || null,
    encrypted,
  };
}

function buildUnsupportedPdfMessage(pdfBytes: Buffer): string {
  const diagnostics = extractPdfDiagnostics(pdfBytes);
  const parts: string[] = [];
  if (diagnostics.version) parts.push(`PDF v${diagnostics.version}`);
  if (typeof diagnostics.pageCountEstimate === 'number') parts.push(`~${diagnostics.pageCountEstimate} עמודים`);
  if (diagnostics.encrypted) parts.push('מזוהה הצפנה/הרשאות');
  const meta = parts.length ? ` | אבחון: ${parts.join(', ')}` : '';
  return `ה-PDF לא נתמך על ידי AWS Textract בפורמט הנוכחי. נסה לשמור מחדש (Print to PDF) או לפצל לעמודים בודדים.${meta}`;
}

function finalizePdfCellText(value: string): string {
  let text = String(value || '')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  // In some RTL extraction flows, parentheses are mirrored (")...(" instead of "(...)").
  const firstOpen = text.indexOf('(');
  const firstClose = text.indexOf(')');
  if (firstOpen !== -1 && firstClose !== -1 && firstClose < firstOpen) {
    text = text.replace(/[()]/g, (ch) => (ch === '(' ? ')' : '('));
  }

  return text
    .replace(/([^\s(])\(/g, '$1 (')
    .replace(/\)([^\s)])/g, ') $1')
    .replace(/([א-ת])\.(\d)/g, '$1. $2')
    // Hebrew final letters are expected at end-of-word; if another Hebrew letter follows,
    // it's usually two glued words from PDF extraction (e.g. שמןפרפין -> שמן פרפין).
    .replace(/([ךםןףץ])([א-ת])/g, '$1 $2')
    .replace(/([א-ת])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([א-ת])/g, '$1 $2')
    .replace(/(\d)([A-Za-z\u0590-\u05FF])/g, '$1 $2')
    .replace(/([A-Za-z\u0590-\u05FF])(\d)/g, '$1 $2')
    .trim();
}

function hasHebrewChars(value: string): boolean {
  return /[\u0590-\u05FF]/.test(String(value || ''));
}

function shouldUseRtlColumnOrder(rows: string[][]): boolean {
  if (!rows.length) return false;
  let hebrewCells = 0;
  let totalCells = 0;
  for (const row of rows.slice(0, 20)) {
    for (const cell of row.slice(0, 20)) {
      totalCells += 1;
      if (hasHebrewChars(cell)) hebrewCells += 1;
    }
  }
  if (!totalCells) return false;
  return hebrewCells / totalCells >= 0.25;
}

function normalizeAndOrientRows(rows: string[][]): string[][] {
  const normalized = rows.map((row) => row.map((cell) => finalizePdfCellText(cell)));
  if (!shouldUseRtlColumnOrder(normalized)) return normalized;
  // RTL tables are visually right-to-left, so we keep first logical column on the right edge.
  return normalized.map((row) => [...row].reverse());
}

function splitTextLineToCells(line: string): string[] {
  const normalized = String(line || '')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/\r/g, '')
    .trim();
  if (!normalized) return [];

  if (normalized.includes('\t')) {
    return normalized
      .split(/\t+/)
      .map((cell) => finalizePdfCellText(cell))
      .filter(Boolean);
  }

  if (normalized.includes('|')) {
    const cells = normalized
      .split('|')
      .map((cell) => finalizePdfCellText(cell))
      .filter(Boolean);
    if (cells.length >= 2) return cells;
  }

  const spacedCells = normalized
    .split(/\s{2,}/)
    .map((cell) => finalizePdfCellText(cell))
    .filter(Boolean);
  if (spacedCells.length >= 2) return spacedCells;

  // If text is not clearly tabular, keep full line as a single cell
  // to avoid splitting Hebrew words into separate letters.
  return [finalizePdfCellText(normalized)];
}

function normalizeRowsWidth(rows: string[][]): string[][] {
  if (!rows.length) return [];
  const width = Math.max(2, ...rows.map((r) => r.length));
  return rows.map((row) => {
    if (row.length === width) return row;
    if (row.length > width) return row.slice(0, width);
    return [...row, ...Array.from({ length: width - row.length }, () => '')];
  });
}

function pickLikelyTableRows(lines: string[]): string[][] {
  const candidates = lines
    .map(splitTextLineToCells)
    .filter((cells) => cells.length >= 2);
  if (candidates.length < 2) return [];

  const widthCounts = new Map<number, number>();
  for (const row of candidates) {
    widthCounts.set(row.length, (widthCounts.get(row.length) || 0) + 1);
  }

  const preferredWidth = Array.from(widthCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 2;

  const filtered = candidates.filter((row) => row.length >= 2 && row.length <= Math.max(12, preferredWidth + 2));
  if (filtered.length < 2) return [];
  return normalizeRowsWidth(filtered.slice(0, 500));
}

async function tryExtractTextTableFromPdf(pdfBytes: Buffer): Promise<ExtractedPdfResult | null> {
  const parser = new PDFParse({ data: new Uint8Array(pdfBytes) });
  try {
    const tableResult = await parser.getTable();
    const tablesFromParser = (tableResult.pages || [])
      .flatMap((page) =>
        (page.tables || []).map((rows) => ({
          page: page.num || 1,
          rows: normalizeAndOrientRows(
            normalizeRowsWidth(rows.map((row) => row.map((cell) => String(cell ?? '').trim()))),
          ),
        })),
      )
      .filter((table) => table.rows.length >= 2 && table.rows[0]?.length >= 2);

    if (tablesFromParser.length > 0) {
      const pagesDetected = Math.max(1, ...tablesFromParser.map((t) => t.page));
      return {
        tables: tablesFromParser.map((table, idx) => ({
          tableIndex: idx,
          pageStart: table.page,
          pageEnd: table.page,
          rows: table.rows,
        })),
        pagesDetected,
        warnings: ['בוצע fallback לטבלת PDF חלופית כי Textract לא תמך בקובץ הזה'],
      };
    }

    const textResult = await parser.getText({ lineEnforce: true });
    const text = String(textResult?.text || '');
    if (text.trim()) {
      const lines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
      const rows = normalizeAndOrientRows(pickLikelyTableRows(lines));
      if (rows.length >= 2) {
        return {
          tables: [
            {
              tableIndex: 0,
              pageStart: 1,
              pageEnd: 1,
              rows,
            },
          ],
          pagesDetected: 1,
          warnings: ['בוצע fallback לחילוץ טקסט מה-PDF כי Textract לא תמך בקובץ הזה'],
        };
      }
    }
    return null;
  } finally {
    await parser.destroy();
  }
}

function getTextFromCell(cell: Block, blockById: Map<string, Block>): string {
  const parts: string[] = [];
  const rels: Relationship[] = cell.Relationships || [];
  const childRel = rels.find((r) => r.Type === 'CHILD');
  if (!childRel?.Ids) return '';

  for (const id of childRel.Ids) {
    const b = blockById.get(id);
    if (!b) continue;
    if (b.BlockType === 'WORD' && b.Text) {
      parts.push(b.Text);
      continue;
    }
    if (b.BlockType === 'SELECTION_ELEMENT' && b.SelectionStatus === 'SELECTED') {
      parts.push('[x]');
    }
  }

  return finalizePdfCellText(parts.join(' '));
}

function getTop(block: Block): number {
  return block.Geometry?.BoundingBox?.Top ?? 0;
}

function getLeft(block: Block): number {
  return block.Geometry?.BoundingBox?.Left ?? 0;
}

function buildRowsFromTable(table: Block, blockById: Map<string, Block>): string[][] {
  const rels: Relationship[] = table.Relationships || [];
  const childRel = rels.find((r) => r.Type === 'CHILD');
  if (!childRel?.Ids?.length) return [];

  const cells = childRel.Ids
    .map((id) => blockById.get(id))
    .filter((b): b is Block => !!b && b.BlockType === 'CELL');

  if (!cells.length) return [];

  const maxRow = Math.max(...cells.map((c) => c.RowIndex || 1));
  const maxCol = Math.max(...cells.map((c) => c.ColumnIndex || 1));
  const matrix: string[][] = Array.from({ length: maxRow }, () =>
    Array.from({ length: maxCol }, () => ''),
  );

  for (const cell of cells) {
    const row = Math.max(1, cell.RowIndex || 1) - 1;
    const col = Math.max(1, cell.ColumnIndex || 1) - 1;
    matrix[row][col] = getTextFromCell(cell, blockById);
  }

  // Trim trailing empty columns per row, then normalize to same width.
  const trimmedRows = matrix.map((row) => {
    let end = row.length;
    while (end > 0 && String(row[end - 1] || '').trim() === '') end -= 1;
    return row.slice(0, Math.max(1, end));
  });
  const width = Math.max(1, ...trimmedRows.map((r) => r.length));
  return normalizeAndOrientRows(trimmedRows.map((row) => {
    if (row.length === width) return row;
    return [...row, ...Array.from({ length: width - row.length }, () => '')];
  }));
}

function getAwsRegion(): string {
  const region = (process.env.AWS_REGION || '').trim();
  if (!region) {
    throw new Error('Missing AWS_REGION');
  }
  return region;
}

export async function extractPdfTablesWithTextract(
  pdfBytes: Buffer,
  options: PdfExtractOptions = {},
): Promise<ExtractedPdfResult> {
  const client = new TextractClient({ region: getAwsRegion() });
  let response;
  try {
    response = await client.send(
      new AnalyzeDocumentCommand({
        Document: { Bytes: new Uint8Array(pdfBytes) },
        FeatureTypes: ['TABLES'],
      }),
    );
  } catch (error: unknown) {
    const raw = String((error as any)?.message || error || '');
    if (raw.includes('UnsupportedDocumentException') || raw.includes('unsupported document format')) {
      try {
        const fallbackResult = await tryExtractTextTableFromPdf(pdfBytes);
        if (fallbackResult) {
          return fallbackResult;
        }
      } catch {
        // Ignore fallback parsing failure and preserve the original semantic error below.
      }
      throw new Error(buildUnsupportedPdfMessage(pdfBytes));
    }
    throw error;
  }

  const blocks = response.Blocks || [];
  const blockById = new Map<string, Block>();
  for (const block of blocks) {
    if (block.Id) blockById.set(block.Id, block);
  }

  const pagesDetected = Math.max(
    0,
    ...blocks
      .map((b) => b.Page || 0)
      .filter((n) => Number.isFinite(n)),
  );

  const pageFrom = options.pageFrom && options.pageFrom > 0 ? Math.floor(options.pageFrom) : 1;
  const pageTo = options.pageTo && options.pageTo > 0 ? Math.floor(options.pageTo) : (pagesDetected || pageFrom);
  const warnings: string[] = [];

  if (options.maxPages && pageTo - pageFrom + 1 > options.maxPages) {
    throw new Error(`טווח עמודים גדול מדי. מקסימום ${options.maxPages} עמודים ל-preview`);
  }

  const tables = blocks
    .filter((b): b is Block => b.BlockType === 'TABLE')
    .filter((t) => {
      const page = t.Page || 1;
      return page >= pageFrom && page <= pageTo;
    })
    .sort((a, b) => {
      const pageDiff = (a.Page || 1) - (b.Page || 1);
      if (pageDiff !== 0) return pageDiff;
      const topDiff = getTop(a) - getTop(b);
      if (topDiff !== 0) return topDiff;
      return getLeft(a) - getLeft(b);
    })
    .map((table, idx) => {
      const rows = buildRowsFromTable(table, blockById);
      const page = table.Page || 1;
      return {
        tableIndex: idx,
        pageStart: page,
        pageEnd: page,
        rows,
      } as ExtractedPdfTable;
    })
    .filter((t) => t.rows.length > 0);

  if (!tables.length) {
    warnings.push('לא נמצאו טבלאות ב-PDF בטווח העמודים שנבחר');
  }

  return {
    tables,
    pagesDetected,
    warnings,
  };
}

