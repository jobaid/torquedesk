-- Email delivery queue.
--
-- Every outbound email (per-shop transactional, platform-level transactional,
-- share-link emails, authorization reminders, password resets) is enqueued
-- here and processed by a background worker with exponential-backoff retries.
--
-- scope = 'tenant'   → company_id required, send through tenant SMTP
-- scope = 'platform' → company_id null,     send through platform SMTP
--
-- dedupe_key is a free-form string callers can set to make an enqueue
-- idempotent — if a row with the same (company_id, dedupe_key) already exists
-- in a non-failed terminal state, the second enqueue is skipped. Prevents
-- duplicate welcome / reminder emails when an event is retried.

CREATE TABLE email_jobs (
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

CREATE INDEX email_jobs_due_idx ON email_jobs (status, next_attempt_at)
    WHERE status = 'pending';
CREATE INDEX email_jobs_company_idx ON email_jobs (company_id, created_at DESC);
CREATE INDEX email_jobs_platform_idx ON email_jobs (created_at DESC)
    WHERE scope = 'platform';
CREATE UNIQUE INDEX email_jobs_dedupe_idx ON email_jobs (coalesce(company_id::text, 'platform'), dedupe_key)
    WHERE dedupe_key <> '';
