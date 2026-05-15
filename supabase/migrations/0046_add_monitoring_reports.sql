CREATE TABLE IF NOT EXISTS monitoring_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overall_status TEXT NOT NULL CHECK (overall_status IN ('OK', 'WARNING', 'FAILED')),
  total_checks INTEGER NOT NULL DEFAULT 0 CHECK (total_checks >= 0),
  passed_checks INTEGER NOT NULL DEFAULT 0 CHECK (passed_checks >= 0),
  failed_checks INTEGER NOT NULL DEFAULT 0 CHECK (failed_checks >= 0),
  avg_response_time_ms NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (avg_response_time_ms >= 0),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NULL,
  report_meta JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_reports_created_at
  ON monitoring_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitoring_reports_run_at
  ON monitoring_reports (run_at DESC);

CREATE TABLE IF NOT EXISTS monitoring_check_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES monitoring_reports(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  check_status TEXT NOT NULL CHECK (check_status IN ('OK', 'WARNING', 'FAILED')),
  response_time_ms NUMERIC(12, 3) NULL CHECK (response_time_ms >= 0),
  error_message TEXT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_check_items_report_id
  ON monitoring_check_items (report_id);
