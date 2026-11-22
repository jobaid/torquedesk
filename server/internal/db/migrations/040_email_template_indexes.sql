-- Repair for 021_email_templates. On a fresh database 021 always failed:
-- the column check `CHECK (scope IN ...)` is auto-named
-- email_templates_scope_check, and the table constraint used that same name,
-- so CREATE TABLE raised "already exists" (42710). The migration runner
-- treats 42710 as "already applied", so the table was never created and
-- every template save failed with 'relation "email_templates" does not exist'.
--
-- Fully idempotent: works whether the table is missing, complete, or
-- missing only its indexes.

CREATE TABLE IF NOT EXISTS email_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope       text NOT NULL CHECK (scope IN ('platform', 'tenant')),
    company_id  uuid REFERENCES companies (id) ON DELETE CASCADE,
    kind        text NOT NULL,
    subject     text NOT NULL,
    body_html   text NOT NULL DEFAULT '',
    body_text   text NOT NULL DEFAULT '',
    enabled     boolean NOT NULL DEFAULT true,
    updated_by  text NOT NULL DEFAULT '',
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_templates_scope_company_check CHECK (
        (scope = 'platform' AND company_id IS NULL) OR
        (scope = 'tenant'   AND company_id IS NOT NULL)
    )
);

-- On servers where the table did exist, remove duplicates before indexing.
DELETE FROM email_templates a USING email_templates b
 WHERE a.scope = 'platform' AND b.scope = 'platform'
   AND a.kind = b.kind AND a.ctid < b.ctid;

DELETE FROM email_templates a USING email_templates b
 WHERE a.scope = 'tenant' AND b.scope = 'tenant'
   AND a.company_id = b.company_id AND a.kind = b.kind AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS email_templates_platform_idx
    ON email_templates (kind) WHERE scope = 'platform';
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_tenant_idx
    ON email_templates (company_id, kind) WHERE scope = 'tenant';
