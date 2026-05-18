import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

const monitoringStatusSchema = z.enum(['OK', 'WARNING', 'FAILED']);

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
  type: z.string().trim().max(120).optional(),
  status: monitoringStatusSchema,
  response_time_ms: z.number().finite().min(0).max(10_000_000).optional(),
  responseTimeMs: z.number().finite().min(0).max(10_000_000).optional(),
  error_message: z.string().trim().max(4000).optional(),
  error: z.string().trim().max(4000).optional(),
  details: z.unknown().optional(),
});

const externalReportSchema = z.object({
  generatedAt: z.string().datetime().optional(),
  environment: z.string().trim().max(120).optional(),
  status: monitoringStatusSchema,
  checks: z.array(externalCheckItemSchema).max(1000),
});

function normalizeExternalPayloadToInternal(input: z.infer<typeof externalReportSchema>): ParsedMonitoringReport {
  const checks = input.checks.map((item) => ({
    name: item.name,
    status: item.status,
    response_time_ms: item.response_time_ms ?? item.responseTimeMs,
    error_message: item.error_message ?? item.error,
    details: item.details ?? (item.type ? { type: item.type } : undefined),
  }));

  const total_checks = checks.length;
  const passed_checks = checks.filter((c) => c.status === 'OK').length;
  const failed_checks = checks.filter((c) => c.status === 'FAILED').length;
  const avg_response_time_ms =
    checks.reduce((sum, c) => sum + (c.response_time_ms ?? 0), 0) / Math.max(total_checks, 1);

  return {
    overall_status: input.status,
    total_checks,
    passed_checks,
    failed_checks,
    avg_response_time_ms,
    run_at: input.generatedAt || new Date().toISOString(),
    source: input.environment || 'external_monitor',
    meta: {
      environment: input.environment ?? null,
      generatedAt: input.generatedAt ?? null,
      payloadFormat: 'external_v1',
    },
    checks,
  };
}

function getMonitoringSecret(): string {
  return String(process.env.MONITORING_INGEST_SECRET || '').trim();
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
  try {
    console.info('[monitoring] ingest hit', {
      method: req.method,
      path: req.originalUrl,
      hasSecretHeader: Boolean(req.header('x-monitoring-secret')),
      userAgent: req.header('user-agent') || null,
    });
    // Accept both legacy internal payload and new external monitor payload.
    let parsed: ParsedMonitoringReport;
    const externalParsed = externalReportSchema.safeParse(req.body);
    if (externalParsed.success) {
      parsed = normalizeExternalPayloadToInternal(externalParsed.data);
    } else {
      const internalParsed = reportSchema.safeParse(req.body);
      if (!internalParsed.success) {
        const firstIssue = internalParsed.error.issues?.[0] ?? externalParsed.error.issues?.[0];
        console.error('[monitoring] payload validation failed', {
          field: firstIssue?.path?.join('.') || '(unknown)',
          code: firstIssue?.code || '(unknown)',
          expected: (firstIssue as any)?.options || null,
          received: (firstIssue as any)?.received || null,
          message: firstIssue?.message || 'Invalid monitoring payload',
        });
        return res.status(400).json({ error: firstIssue?.message || 'Invalid monitoring payload' });
      }
      parsed = internalParsed.data;
    }

    await saveMonitoringReport(parsed);
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('[monitoring] report ingest failed', error);
    return res.status(500).json({ error: 'Monitoring ingest failed' });
  }
});

// Keep /report public-but-secret-protected only for POST.
// If someone opens this URL in browser (GET), return method error here
// and do not fall through to admin auth middleware.
router.all('/report', (req, res) => {
  return res.status(405).json({ error: 'Method not allowed. Use POST with x-monitoring-secret.' });
});

async function saveMonitoringReport(parsed: ParsedMonitoringReport): Promise<{ ok: boolean; report_id: string; created_at: string }> {
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
