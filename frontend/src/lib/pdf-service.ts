type TablePdfColumn = {
  key: string;
  label: string;
};

type DownloadTablePdfInput = {
  storeName: string;
  title: string;
  columns: TablePdfColumn[];
  rows: Array<Array<string | number | null>>;
  filename?: string;
};

function getPdfServiceConfig() {
  const url = import.meta.env.VITE_PDF_SERVICE_URL
  const key = import.meta.env.VITE_PDF_SERVICE_KEY


  return { url: url.replace(/\/+$/, ''), key: key! };
}

function sanitizeFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

/**
 * Calls external PDF service and opens the returned PDF in a new tab (preferred),
 * falling back to triggering a browser download.
 */
export async function downloadTablePdf(input: DownloadTablePdfInput): Promise<void> {
  const { url, key } = getPdfServiceConfig();

  const endpoint = `${url}/pdf/table`;

  if (process.env.NODE_ENV !== 'production') {
    // Dev-only diagnostics: log URL but never the key
    console.log('[PDF] Calling external PDF service:', endpoint);
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({
      storeName: input.storeName,
      title: input.title,
      columns: input.columns,
      rows: input.rows,
    }),
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[PDF] PDF service response status:', res.status);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PDF service error: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const filename = sanitizeFilename(input.filename || `${input.title}.pdf`);

  // Prefer opening in a new tab
  const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (opened) return;

  // Fallback: force download
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

