-- Technician mobile inspection links.
--
-- A manager issues a per-inspection token the technician opens on their phone.
-- The token grants read/write access ONLY to that inspection — never to any
-- other data in the tenant. Pricing is excluded by design: the technician
-- endpoints never touch documents, payments, invoices or estimates.
--
-- status + recommendation are added to the existing inspection tables so the
-- full workflow (not_started → in_progress → submitted → manager_review →
-- completed) can be tracked without a separate state table.

CREATE TABLE inspection_tokens (
    token          text PRIMARY KEY,                           -- 32-byte base64url
    inspection_id  uuid NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
    company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    created_by     text NOT NULL DEFAULT '',                   -- manager display name
    technician_id  integer,                                    -- optional shop_technicians.id
    created_at     timestamptz NOT NULL DEFAULT now(),
    revoked_at     timestamptz,
    last_opened_at timestamptz,
    open_count     integer NOT NULL DEFAULT 0
);
CREATE INDEX inspection_tokens_inspection ON inspection_tokens (inspection_id);
CREATE INDEX inspection_tokens_company    ON inspection_tokens (company_id);

-- inspections.status was CHECK'd to in_progress/completed/cancelled in the
-- original migration. Widen to cover the full technician workflow.
ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_status_check;
ALTER TABLE inspections ADD CONSTRAINT inspections_status_check
    CHECK (status IN ('not_started', 'in_progress', 'submitted', 'manager_review', 'completed', 'cancelled'));

-- Recommendation for each item: what the technician thinks should be done.
-- Separate from "severity" (which is advisory) so the manager has a clear
-- action signal when pulling findings into an estimate.
ALTER TABLE inspection_items ADD COLUMN recommendation text NOT NULL DEFAULT 'none'
    CHECK (recommendation IN ('none', 'inspect_further', 'repair', 'replace', 'service', 'monitor', 'customer_declined', 'other'));
