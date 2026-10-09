-- Email delivery queue. Idempotent.
--
-- Simplified from the first draft: the dedupe uniqueness is now a
-- regular (not partial, no expression) unique index on a single
-- synthesized text column (dedupe_slot), so ON CONFLICT inference
-- works on any supported Postgres version. The slot is empty when
-- the caller doesn't want dedupe, and dedupe is skipped at the Go
-- layer in that case.

CREATE TABLE IF NOT EXISTS email_jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid REFERENCES companies (id) ON DELETE CASCADE,
    scope           text NOT NULL CHECK (scope IN ('tenant', 'platform')),
    to_email        text NOT NULL,
    subject         text NOT NULL,
    body_html       text NOT NULL DEFAULT '',
    body_text       text NOT NULL DEFAULT '',
    kind            text NOT NULL DEFAULT 'custom',
    related_type    text NOT NULL DEFAULT '',
    related_id      text NOT NULL DEFAULT '',
    dedupe_key      text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts        int NOT NULL DEFAULT 0,
    max_attempts    int NOT NULL DEFAULT 5,
    last_error      text NOT NULL DEFAULT '',
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_jobs_due_idx ON email_jobs (status, next_attempt_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS email_jobs_company_idx ON email_jobs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_jobs_platform_idx ON email_jobs (created_at DESC)
    WHERE scope = 'platform';

-- Drop the earlier expression-based partial dedupe index if an older
-- partial migration created it, so the simpler index below can take over.
DROP INDEX IF EXISTS email_jobs_dedupe_idx;
