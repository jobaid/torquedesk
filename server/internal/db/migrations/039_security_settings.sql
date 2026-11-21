-- Security & UI Protection: owner-controlled toggles, per-page overrides,
-- an event log, and session revocations. Rows are created lazily: a missing
-- security_settings row means "use the catalog default" (see
-- security_settings.go), so this migration seeds nothing.

CREATE TABLE IF NOT EXISTS security_settings (
    setting_key   text PRIMARY KEY,
    is_enabled    boolean NOT NULL,
    setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by    text NOT NULL DEFAULT '',
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A row here overrides the global value for one page. No row = inherit.
CREATE TABLE IF NOT EXISTS security_page_settings (
    page_key     text NOT NULL,
    setting_key  text NOT NULL,
    is_enabled   boolean NOT NULL,
    updated_by   text NOT NULL DEFAULT '',
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (page_key, setting_key)
);

CREATE TABLE IF NOT EXISTS security_events (
    id                bigserial PRIMARY KEY,
    company_id        uuid REFERENCES companies(id) ON DELETE SET NULL,
    user_email        text NOT NULL DEFAULT '',
    user_role         text NOT NULL DEFAULT '',
    event_type        text NOT NULL,
    severity          text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','high')),
    page_key          text NOT NULL DEFAULT '',
    ip_address        text NOT NULL DEFAULT '',
    country           text NOT NULL DEFAULT '',
    browser           text NOT NULL DEFAULT '',
    operating_system  text NOT NULL DEFAULT '',
    user_agent        text NOT NULL DEFAULT '',
    event_details     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_created ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_company ON security_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_ip ON security_events (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_user ON security_events (lower(user_email), created_at DESC);

-- Tokens are stateless JWTs; revoking a session = every token for this
-- subject issued before revoked_at stops verifying.
-- subject = lower(email) || '|' || company_id ('' for SaaS owners).
CREATE TABLE IF NOT EXISTS security_session_revocations (
    subject     text PRIMARY KEY,
    revoked_at  timestamptz NOT NULL DEFAULT now(),
    revoked_by  text NOT NULL DEFAULT ''
);
