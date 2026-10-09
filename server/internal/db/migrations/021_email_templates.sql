-- Editable email templates.
--
-- scope = 'platform' with company_id NULL  → one global row per kind, owned
--                                             by the SaaS owner, used for
--                                             welcome / status / subscription
--                                             emails sent FROM the platform.
-- scope = 'tenant' with company_id set     → per-shop override for templates
--                                             used by that shop (password
--                                             reset, authorization reminder,
--                                             share link, etc.).
--
-- If a row is missing or enabled=false the sender falls back to the
-- hardcoded default built into Go. Shops/owners therefore never lose email
-- functionality by never visiting this page.

CREATE TABLE email_templates (
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

CREATE UNIQUE INDEX email_templates_platform_idx
    ON email_templates (kind) WHERE scope = 'platform';
CREATE UNIQUE INDEX email_templates_tenant_idx
    ON email_templates (company_id, kind) WHERE scope = 'tenant';
