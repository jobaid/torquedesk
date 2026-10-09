-- Editable email templates. Idempotent so a partial earlier run doesn't
-- block subsequent restarts: CREATE TABLE IF NOT EXISTS skips when the
-- table (and its inline constraints) already exist, CREATE UNIQUE INDEX
-- IF NOT EXISTS skips when the index is already there, and the ALTER TABLE
-- that re-adds the named CHECK is wrapped in a DO block that swallows the
-- duplicate_object error.

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
    CONSTRAINT email_templates_scope_check CHECK (
        (scope = 'platform' AND company_id IS NULL) OR
        (scope = 'tenant'   AND company_id IS NOT NULL)
    )
);

-- If an earlier partial run created the table without the named CHECK (or
-- vice versa), fix either half without blowing up when both already exist.
DO $$ BEGIN
    ALTER TABLE email_templates ADD CONSTRAINT email_templates_scope_check CHECK (
        (scope = 'platform' AND company_id IS NULL) OR
        (scope = 'tenant'   AND company_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN duplicate_table THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_templates_platform_idx
    ON email_templates (kind) WHERE scope = 'platform';
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_tenant_idx
    ON email_templates (company_id, kind) WHERE scope = 'tenant';
