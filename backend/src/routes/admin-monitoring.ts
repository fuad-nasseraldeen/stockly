import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

const monitoringStatusSchema = z.enum(['OK', 'WARNING', 'FAILED']);
const monitoringCheckTypeSchema = z.enum(['API', 'DATA', 'AUTH']);

const checkItemSchema = z.object({
  name: z.string().trim().min(1).max(300),
  status: monitoringStatusSchema,
  response_time_ms: z.number().finite().min(0).max(10_000_000).optional(),
  error_message: z.string().trim().max(4000).optional(),
  details: z.unknown().optional(),
});

const reportSchema = z.object({
  overall_status: monitoringStatusSchema,
  total_checks: z.number().int().min(0),
  passed_checks: z.number().int().min(0),
  failed_checks: z.number().int().min(0),
  avg_response_time_ms: z.number().finite().min(0),
  run_at: z.string().datetime().optional(),
  source: z.string().trim().max(200).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  checks: z.array(checkItemSchema).max(1000),
});
type ParsedMonitoringReport = z.infer<typeof reportSchema>;

// External monitor payload format (GitHub Action)
const externalCheckItemSchema = z.object({
  name: z.string().trim().min(1).max(300),
  type: monitoringCheckTypeSchema,
  status: monitoringStatusSchema,
  response_time_ms: z.number().finite().min(0).max(10_000_000).optional(),
  responseTimeMs: z.number().finite().min(0).max(10_000_000).optional(),
  message: z.string().trim().max(4000).optional(),
  error_message: z.string().trim().max(4000).optional(),
  error: z.string().trim().max(4000).optional(),
  details: z.unknown().optional(),
});

const externalReportSchema = z.object({
  generatedAt: z.string().datetime().optional(),
  environment: z.string().trim().max(120).optional(),
  status: monitoringStatusSchema,
  checks: z.array(externalCheckItemSchema).max(1000),
  totals: z.object({
    total: z.number().int().min(0),
    passed: z.number().int().min(0),
    warning: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
});

function normalizeExternalPayloadToInternal(input: z.infer<typeof externalReportSchema>): ParsedMonitoringReport {
  const checks = input.checks.map((item) => ({
    name: item.name,
    status: item.status,
    response_time_ms: item.response_time_ms ?? item.responseTimeMs,
    error_message: item.message ?? item.error_message ?? item.error,
    details:
      item.details && typeof item.details === 'object' && !Array.isArray(item.details)
        ? { ...(item.details as Record<string, unknown>), type: item.type }
        : { type: item.type, details: item.details ?? null },
  }));

  const total_checks = input.totals.total;
  const passed_checks = input.totals.passed;
  const failed_checks = input.totals.failed;
  const avg_response_time_ms =
    checks.reduce((sum, c) => sum + (c.response_time_ms ?? 0), 0) / Math.max(checks.length, 1);

  return {
    overall_status: input.status,
    total_checks,
    passed_checks,
    failed_checks,
    avg_response_time_ms,
    run_at: input.generatedAt || new Date().toISOString(),
    source: 'github_actions',
    meta: {
      environment: input.environment || null,
      generatedAt: input.generatedAt || null,
      totals: input.totals,
      payloadFormat: 'external_v1',
    },
    checks,
  };
}

function getValueByPath(payload: unknown, path: Array<string | number>): unknown {
  let current: any = payload;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = current[key as any];
  }
  return current;
}

function formatIssueForResponse(
  payload: unknown,
  issue: z.ZodIssue | undefined,
): { error: string; field: string; receivedValue: unknown; expectedValues: unknown } {
  const issuePath = (issue?.path || []).filter((p): p is string | number => typeof p === 'string' || typeof p === 'number');
  const field = issuePath.length ? issuePath.join('.') : '(root)';
  const receivedValue = issue ? getValueByPath(payload, issuePath) : undefined;
  const expectedValues = (issue as any)?.options ?? null;
  return {
    error: issue?.message || 'Invalid monitoring payload',
    field,
    receivedValue: receivedValue === undefined ? null : receivedValue,
    expectedValues,
  };
}

function getMonitoringSecret(): string {
  return String(process.env.MONITORING_INGEST_SECRET || '').trim();
}

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startMs: number): number {
  return nowMs() - startMs;
}

function ingestTimeoutMs(): number {
  const raw = Number(process.env.MONITORING_INGEST_MAX_MS || 7000);
  if (!Number.isFinite(raw) || raw < 1000) return 7000;
  return Math.floor(raw);
}

function requireMonitoringSecret(req: any, res: any, next: any) {
  const configured = getMonitoringSecret();
  const incoming = String(req.header('x-monitoring-secret') || '').trim();

  if (!configured) {
    console.error('[monitoring] MONITORING_INGEST_SECRET is not configured');
    return res.status(503).json({ error: 'Monitoring ingest is not configured' });
  }

  if (!incoming || incoming !== configured) {
    return res.status(401).json({ error: 'Invalid monitoring secret' });
  }

  return next();
}

router.post('/report', requireMonitoringSecret, async (req, res) => {
  const reqStartedAt = nowMs();
  const reqId = `ing-${reqStartedAt}-${Math.floor(Math.random() * 1_000_000)}`;
  const timeoutMs = ingestTimeoutMs();
  let responded = false;
  let responseSentAt = 0;
  const safeSendOk = () => {
    if (responded) return;
    responded = true;
    responseSentAt = nowMs();
    console.info('[monitoring] response sent', {
      reqId,
      totalMs: elapsedMs(reqStartedAt),
      timeoutMs,
    });
    res.status(200).json({ ok: true });
  };

  try {
    console.info('[monitoring] ingest hit', {
      reqId,
      method: req.method,
      path: req.originalUrl,
      hasSecretHeader: Boolean(req.header('x-monitoring-secret')),
      userAgent: req.header('user-agent') || null,
      t0: 0,
    });
    console.info('[monitoring] secret validated', { reqId, elapsedMs: elapsedMs(reqStartedAt) });

    // Accept both legacy internal payload and new external monitor payload.
    let parsed: ParsedMonitoringReport;
    const externalParsed = externalReportSchema.safeParse(req.body);
    if (externalParsed.success) {
      parsed = normalizeExternalPayloadToInternal(externalParsed.data);
    } else {
      const internalParsed = reportSchema.safeParse(req.body);
      if (!internalParsed.success) {
        const firstIssue = externalParsed.error.issues?.[0] ?? internalParsed.error.issues?.[0];
        const responsePayload = formatIssueForResponse(req.body, firstIssue);
        console.error('[monitoring] payload validation failed', {
          reqId,
          field: responsePayload.field,
          code: firstIssue?.code || '(unknown)',
          expected: (firstIssue as any)?.options || null,
          receivedValue: responsePayload.receivedValue,
          message: responsePayload.error,
          elapsedMs: elapsedMs(reqStartedAt),
          externalIssues: externalParsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
          internalIssues: internalParsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
        });
        return res.status(400).json(responsePayload);
      }
      parsed = internalParsed.data;
    }
    console.info('[monitoring] payload validated', {
      reqId,
      elapsedMs: elapsedMs(reqStartedAt),
      checks: parsed.checks.length,
      overallStatus: parsed.overall_status,
    });
    console.info('[monitoring] payload parsed before db insert', {
      reqId,
      elapsedMs: elapsedMs(reqStartedAt),
      parsed,
    });

    console.info('[monitoring] db insert started', { reqId, elapsedMs: elapsedMs(reqStartedAt) });
    const dbWritePromise = (async () => {
      try {
        await saveMonitoringReport(parsed);
        console.info('[monitoring] db insert completed', {
          reqId,
          elapsedMs: elapsedMs(reqStartedAt),
        });
        safeSendOk();
      } catch (dbError) {
        console.error('[monitoring] db insert failed', {
          reqId,
          elapsedMs: elapsedMs(reqStartedAt),
          error:
            dbError instanceof Error
              ? { name: dbError.name, message: dbError.message, stack: dbError.stack }
              : dbError,
        });
        if (!responded) {
          return res.status(500).json({ error: 'Monitoring ingest failed' });
        }
      }
    })();

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!responded) {
          console.error('[monitoring] ingest timeout fallback', {
            reqId,
            elapsedMs: elapsedMs(reqStartedAt),
            timeoutMs,
          });
          // Timeout-safe behavior: return quickly to caller.
          safeSendOk();
        }
        resolve();
      }, timeoutMs);
    });

    await Promise.race([dbWritePromise, timeoutPromise]);
    return;
  } catch (error) {
    console.error('[monitoring] report ingest failed', error);
    if (!responded) {
      return res.status(500).json({ error: 'Monitoring ingest failed' });
    }
    console.error('[monitoring] report ingest failed after response', {
      reqId,
      elapsedMs: elapsedMs(reqStartedAt),
      responseSentAtOffsetMs: responseSentAt ? responseSentAt - reqStartedAt : null,
    });
    return;
  }
});

// Keep /report public-but-secret-protected only for POST.
// If someone opens this URL in browser (GET), return method error here
// and do not fall through to admin auth middleware.
router.all('/report', (req, res) => {
  return res.status(405).json({ error: 'Method not allowed. Use POST with x-monitoring-secret.' });
});

async function getTableCount(table: 'products' | 'suppliers' | 'categories'): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (error) {
    throw error;
  }
  return Number(count || 0);
}

router.get('/health/products', requireMonitoringSecret, async (_req, res) => {
  try {
    const count = await getTableCount('products');
    return res.status(200).json({ ok: true, count });
  } catch (error) {
    console.error('[monitoring] health/products failed', error);
    return res.status(500).json({ error: 'Monitoring health check failed' });
  }
});

router.get('/health/suppliers', requireMonitoringSecret, async (_req, res) => {
  try {
    const count = await getTableCount('suppliers');
    return res.status(200).json({ ok: true, count });
  } catch (error) {
    console.error('[monitoring] health/suppliers failed', error);
    return res.status(500).json({ error: 'Monitoring health check failed' });
  }
});

router.get('/health/categories', requireMonitoringSecret, async (_req, res) => {
  try {
    const count = await getTableCount('categories');
    return res.status(200).json({ ok: true, count });
  } catch (error) {
    console.error('[monitoring] health/categories failed', error);
    return res.status(500).json({ error: 'Monitoring health check failed' });
  }
});

async function saveMonitoringReport(parsed: ParsedMonitoringReport): Promise<{ ok: boolean; report_id: string; created_at: string }> {
  try {
    const { data: reportRow, error: reportError } = await supabase
      .from('monitoring_reports')
      .insert({
        overall_status: parsed.overall_status,
        total_checks: parsed.total_checks,
        passed_checks: parsed.passed_checks,
        failed_checks: parsed.failed_checks,
        avg_response_time_ms: parsed.avg_response_time_ms,
        run_at: parsed.run_at || new Date().toISOString(),
        source: parsed.source || null,
        report_meta: parsed.meta || null,
      })
      .select('id, created_at')
      .single();

    if (reportError || !reportRow) {
      console.error('[monitoring] failed to insert report', reportError);
      throw new Error('Failed to save monitoring report');
    }

    const itemRows = parsed.checks.map((item) => ({
      report_id: reportRow.id,
      check_name: item.name,
      check_status: item.status,
      response_time_ms: item.response_time_ms ?? null,
      error_message: item.error_message || null,
      details: item.details ?? null,
    }));

    if (itemRows.length > 0) {
      const { error: itemsError } = await supabase
        .from('monitoring_check_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('[monitoring] failed to insert check items', itemsError);
        throw new Error('Failed to save monitoring check items');
      }
    }

    return { ok: true, report_id: reportRow.id, created_at: reportRow.created_at };
  } catch (error) {
    console.error('[monitoring] saveMonitoringReport unexpected error', {
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
    });
    throw error;
  }
}

router.use(requireAuth, requireSuperAdmin);

router.post('/run-now', async (_req, res) => {
  try {
    const checks: Array<{ name: string; status: 'OK' | 'WARNING' | 'FAILED'; response_time_ms?: number; error_message?: string; details?: unknown }> = [];

    const apiStarted = Date.now();
    let apiStatus: 'OK' | 'FAILED' = 'OK';
    let apiError: string | undefined;
    try {
      const appUrl = `http://127.0.0.1:${process.env.PORT || 3001}/health`;
      const response = await fetch(appUrl);
      if (!response.ok) {
        apiStatus = 'FAILED';
        apiError = `health returned ${response.status}`;
      }
    } catch (err) {
      apiStatus = 'FAILED';
      apiError = err instanceof Error ? err.message : 'health request failed';
    }
    checks.push({
      name: 'api_health',
      status: apiStatus,
      response_time_ms: Date.now() - apiStarted,
      error_message: apiError,
    });

    const dbStarted = Date.now();
    let dbStatus: 'OK' | 'FAILED' = 'OK';
    let dbError: string | undefined;
    try {
      const { error } = await supabase
        .from('tenants')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      if (error) {
        dbStatus = 'FAILED';
        dbError = error.message;
      }
    } catch (err) {
      dbStatus = 'FAILED';
      dbError = err instanceof Error ? err.message : 'db check failed';
    }
    checks.push({
      name: 'db_connectivity',
      status: dbStatus,
      response_time_ms: Date.now() - dbStarted,
      error_message: dbError,
    });

    const totalChecks = checks.length;
    const failedChecks = checks.filter((c) => c.status === 'FAILED').length;
    const passedChecks = checks.filter((c) => c.status === 'OK').length;
    const avgResponse = checks.reduce((acc, c) => acc + (c.response_time_ms || 0), 0) / Math.max(totalChecks, 1);
    const overallStatus: 'OK' | 'FAILED' = failedChecks > 0 ? 'FAILED' : 'OK';

    const saved = await saveMonitoringReport({
      overall_status: overallStatus,
      total_checks: totalChecks,
      passed_checks: passedChecks,
      failed_checks: failedChecks,
      avg_response_time_ms: avgResponse,
      run_at: new Date().toISOString(),
      source: 'admin_run_now',
      meta: { triggeredBy: 'super_admin' },
      checks,
    });

    return res.status(201).json(saved);
  } catch (error) {
    console.error('[monitoring] run-now failed', error);
    return res.status(500).json({ error: 'Monitoring run failed' });
  }
});

router.get('/latest', async (_req, res) => {
  try {
    const { data: report, error: reportError } = await supabase
      .from('monitoring_reports')
      .select('*')
      .order('run_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportError) {
      console.error('[monitoring] latest report fetch failed', reportError);
      return res.status(500).json({ error: 'Failed to fetch latest monitoring report' });
    }

    if (!report) {
      return res.json({ report: null, checks: [] });
    }

    const { data: checks, error: checksError } = await supabase
      .from('monitoring_check_items')
      .select('*')
      .eq('report_id', report.id)
      .order('created_at', { ascending: true });

    if (checksError) {
      console.error('[monitoring] latest checks fetch failed', checksError);
      return res.status(500).json({ error: 'Failed to fetch latest monitoring checks' });
    }

    return res.json({ report, checks: checks || [] });
  } catch (error) {
    console.error('[monitoring] latest endpoint failed', error);
    return res.status(500).json({ error: 'Monitoring latest endpoint failed' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 30;

    const { data: reports, error } = await supabase
      .from('monitoring_reports')
      .select('*')
      .order('run_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[monitoring] history fetch failed', error);
      return res.status(500).json({ error: 'Failed to fetch monitoring history' });
    }

    return res.json({ reports: reports || [] });
  } catch (error) {
    console.error('[monitoring] history endpoint failed', error);
    return res.status(500).json({ error: 'Monitoring history endpoint failed' });
  }
});

export default router;
