-- 021_email_templates was marked applied on some servers after it aborted
-- partway ("schema already present"), so its two partial unique indexes were
-- never created. Template saves use ON CONFLICT against them and fail with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Dedupe defensively (keep the newest row), then create them if missing.

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
