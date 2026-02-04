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
  subtitle?: string; // Optional subtitle (e.g., "סך הכל מוצרים: X")
};

function getPdfServiceConfig() {
  const url = (import.meta.env.VITE_PDF_SERVICE_URL ?? '').trim();
  const key = (import.meta.env.VITE_PDF_SERVICE_KEY ?? '').trim();

  const missing: string[] = [];
  if (!url) missing.push('VITE_PDF_SERVICE_URL');
  if (!key) missing.push('VITE_PDF_SERVICE_KEY');

  if (missing.length > 0) {
    const message = `Missing PDF env var${missing.length > 1 ? 's' : ''}: ${missing.join(
      ', '
    )}. Please configure them in your Vite environment.`;

    // Surface a clear UI error in the browser
    if (typeof window !== 'undefined') {
      alert(message);
    }

    throw new Error(message);
  }


  return { url: url.replace(/\/+$/, ''), key };
}

function sanitizeFilename(name: string) {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

/**
 * Calls external PDF service and opens the returned PDF in a new tab (preferred),
 * falling back to triggering a browser download.
 */
export async function downloadTablePdf(input: DownloadTablePdfInput): Promise<void> {
  const { url, key } = getPdfServiceConfig();

  // Validate input
  if (!input.storeName || !input.title) {
    throw new Error('storeName and title are required');
  }
  if (!Array.isArray(input.columns) || input.columns.length === 0) {
    throw new Error('columns must be a non-empty array');
  }
  if (!Array.isArray(input.rows)) {
    throw new Error('rows must be an array');
  }

  // In development, use Vite proxy to avoid CORS issues
  // In production, use the direct URL
  const isDev = import.meta.env.MODE === 'development';
  const endpoint = isDev 
    ? `/pdf-proxy/pdf/table`  // Vite proxy path
    : `${url}/pdf/table`;     // Direct URL in production

  // Debug logging
  console.log('[PDF] Environment:', {
    mode: import.meta.env.MODE,
    isDev,
    endpoint,
    baseUrl: url,
  });

  // Server expects columns as array of objects with key and label
  // For RTL Hebrew, reverse the column order (rightmost column first)
  // Ensure SKU is the rightmost column (first after reverse)
  const originalColumns = input.columns.map((col) => ({
    key: col.key || String(col),
    label: col.label || col.key || String(col),
  }));
  
  // Separate SKU column if it exists, to place it at the end (rightmost)
  const skuColumn = originalColumns.find((col) => col.key === 'sku');
  const otherColumns = originalColumns.filter((col) => col.key !== 'sku');
  
  // Reverse columns for RTL display, with SKU as the rightmost (first in reversed array)
  const columns = skuColumn 
    ? [skuColumn, ...otherColumns.reverse()]
    : [...otherColumns].reverse();
  const columnKeys = columns.map((col) => col.key);
  
  // Server expects rows as array of objects, where each object has column keys as properties
  // Map rows to objects with column keys, preserving RTL order
  const originalColumnKeys = originalColumns.map((col) => col.key);
  const rows = input.rows.map((row) => {
    if (Array.isArray(row)) {
      // Convert array to object using original column keys as map
      // Then reorder according to new columnKeys (RTL order with SKU first)
      const rowObj: Record<string, string | number | null> = {};
      
      // First, map array values to original column keys
      originalColumnKeys.forEach((key, index) => {
        const value = row[index];
        rowObj[key] = value === null || value === undefined ? '' : value;
      });
      
      // Now create new object in the order of columnKeys (RTL with SKU first)
      const orderedRowObj: Record<string, string | number | null> = {};
      columnKeys.forEach((key) => {
        orderedRowObj[key] = rowObj[key] ?? '';
      });
      
      return orderedRowObj;
    }
    // If already an object, ensure all column keys are present (order doesn't matter for objects)
    const rowObj: Record<string, string | number | null> = {};
    columnKeys.forEach((key) => {
      const value = typeof row === 'object' && row !== null && key in row
        ? (row as Record<string, unknown>)[key]
        : null;
      // Ensure value is string, number, or null
      if (value === null || value === undefined) {
        rowObj[key] = '';
      } else if (typeof value === 'string' || typeof value === 'number') {
        rowObj[key] = value;
      } else {
        rowObj[key] = String(value);
      }
    });
    return rowObj;
  });

  // Add printedAtISO timestamp (required by server)
  const printedAtISO = new Date().toISOString();

  // Format title with date on the right (RTL)
  const formattedTitle = input.subtitle 
    ? `${input.title} | ${input.subtitle}`
    : input.title;

  const requestBody = {
    storeName: String(input.storeName),
    title: formattedTitle,
    printedAtISO,
    columns,
    rows,
    rtl: true,
    lang: 'he',
  };

  // Always log in dev, and log endpoint details
  console.log('[PDF] Making request:', {
    endpoint,
    method: 'POST',
    isDev,
    mode: import.meta.env.MODE,
    fullUrl: isDev ? `${window.location.origin}${endpoint}` : endpoint,
  });
  
  if (import.meta.env.MODE !== 'production') {
    // Dev-only diagnostics: log URL but never the key
    console.log('[PDF] Request payload summary:', {
      storeName: requestBody.storeName,
      title: requestBody.title,
      columnsCount: requestBody.columns.length,
      rowsCount: requestBody.rows.length,
      firstRowSample: requestBody.rows[0],
      printedAtISO: requestBody.printedAtISO,
    });
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key, // Only send API key in header, not in body
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    // CORS or network error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const corsError = `CORS error: The PDF service at ${url} is not allowing requests from this origin. Please ensure the service has CORS configured to allow requests from ${window.location.origin}`;
      console.error('[PDF]', corsError);
      alert(`שגיאת CORS: השירות לא מאפשר בקשות מהדומיין הזה. אנא ודא שהשירות מוגדר לאפשר CORS.`);
      throw new Error(corsError);
    }
    throw error;
  }

  if (import.meta.env.MODE !== 'production') {
    console.log('[PDF] PDF service response status:', res.status);
    console.log('[PDF] Response headers:', Object.fromEntries(res.headers.entries()));
  }

  if (!res.ok) {
    let errorDetails = '';
    try {
      const text = await res.text();
      errorDetails = text;
      // Try to parse as JSON for better error message
      try {
        const json = JSON.parse(text);
        errorDetails = JSON.stringify(json, null, 2);
      } catch {
        // Not JSON, use as-is
      }
    } catch {
      errorDetails = 'Could not read error response';
    }

    const errorMsg = `PDF service error: ${res.status} ${res.statusText}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ''}`;
    console.error('[PDF]', errorMsg);
    console.error('[PDF] Request that failed:', {
      endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key ? '[REDACTED]' : 'MISSING',
      },
      body: requestBody,
    });

    // Show user-friendly error with details in console
    const userMessage = `שגיאה בשירות PDF (${res.status}): ${errorDetails ? errorDetails.substring(0, 200) : res.statusText}\n\nפרטים נוספים בקונסול.`;
    alert(userMessage);
    throw new Error(errorMsg);
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

