-- Data migration tool: SaaS owner uploads a CSV from another shop-management
-- app and imports it into a target company. One row per job; csv_bytes is
-- dropped after commit so we don't hoard uploaded files.

CREATE TABLE IF NOT EXISTS data_migration_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity          text NOT NULL,                          -- 'customers'
  source_vendor   text NOT NULL DEFAULT 'custom',          -- shopware|tekmetric|mitchell1|rowriter|shopmonkey|custom
  status          text NOT NULL DEFAULT 'draft',           -- draft|mapped|dry_run_ok|dry_run_failed|completed|failed
  file_name       text NOT NULL DEFAULT '',
  csv_bytes       bytea,
  csv_headers     text[] NOT NULL DEFAULT '{}',
  row_count       int NOT NULL DEFAULT 0,
  mapping         jsonb NOT NULL DEFAULT '{}'::jsonb,
  dry_run_report  jsonb,
  commit_report   jsonb,
  imported_count  int NOT NULL DEFAULT 0,
  skipped_count   int NOT NULL DEFAULT 0,
  error_message   text NOT NULL DEFAULT '',
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_migration_jobs_company ON data_migration_jobs (company_id, created_at DESC);
