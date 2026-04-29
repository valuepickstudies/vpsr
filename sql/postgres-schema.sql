-- Parity schema for optional dual-write from SQLite (POSTGRES_URL).
-- Timestamps stored as TIMESTAMPTZ; legacy ISO strings from SQLite are accepted as text where needed.

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  symbol TEXT,
  company_name TEXT,
  subject TEXT,
  date TEXT,
  pdf_link TEXT,
  exchange TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS document_intelligence (
  announcement_id TEXT PRIMARY KEY,
  symbol TEXT,
  exchange TEXT,
  pdf_url TEXT,
  content_sha256 TEXT,
  doc_category TEXT,
  text_snippet TEXT,
  status TEXT NOT NULL,
  error TEXT,
  processed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_runs (
  id BIGSERIAL PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  symbol TEXT,
  exchange TEXT,
  verdict TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  nse_matched INTEGER NOT NULL DEFAULT 0,
  bse_matched INTEGER NOT NULL DEFAULT 0,
  screener_matched INTEGER NOT NULL DEFAULT 0,
  drift_score INTEGER NOT NULL DEFAULT 0,
  mismatch_severity TEXT NOT NULL DEFAULT 'low',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_reports (
  id BIGINT PRIMARY KEY,
  company_name TEXT NOT NULL,
  symbol TEXT,
  country TEXT NOT NULL,
  source_url TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_perf_cache (
  id BIGINT PRIMARY KEY,
  symbol TEXT NOT NULL,
  start_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (symbol, start_date)
);

CREATE TABLE IF NOT EXISTS report_outcomes (
  id BIGINT PRIMARY KEY,
  recommendation_id BIGINT,
  report_id BIGINT NOT NULL,
  symbol TEXT NOT NULL,
  country TEXT NOT NULL,
  horizon_days INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  entry_date TEXT,
  entry_price DOUBLE PRECISION,
  target_date TEXT,
  target_price DOUBLE PRECISION,
  return_pct DOUBLE PRECISION,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (report_id, horizon_days)
);

CREATE TABLE IF NOT EXISTS company_thesis_memory (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  country TEXT NOT NULL,
  thesis TEXT NOT NULL,
  invalidation_triggers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invalidated_reason TEXT,
  invalidated_at TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (symbol, country)
);

CREATE TABLE IF NOT EXISTS recommendations (
  id BIGINT PRIMARY KEY,
  report_id BIGINT,
  symbol TEXT NOT NULL,
  country TEXT NOT NULL,
  recommendation_action TEXT NOT NULL,
  confidence_pct DOUBLE PRECISION NOT NULL,
  horizon_days INTEGER NOT NULL,
  risk_class TEXT NOT NULL,
  explainability_json TEXT NOT NULL,
  score_snapshot_json TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendation_actions (
  id BIGINT PRIMARY KEY,
  recommendation_id BIGINT NOT NULL,
  action_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  execution_price DOUBLE PRECISION,
  execution_date TEXT,
  size_value DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_versions (
  id BIGSERIAL PRIMARY KEY,
  version TEXT UNIQUE NOT NULL,
  weights_json TEXT NOT NULL,
  metrics_json TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
