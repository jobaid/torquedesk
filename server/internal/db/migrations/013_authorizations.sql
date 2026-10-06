-- Session A of Customer Authorization: document-level approve/deny/changes.
--
-- A document (estimate / repair order / invoice) can have ONE active
-- authorization request. The request records the customer's decision + reason
-- + timestamp. All events (requested, viewed, approved, denied, changes
-- requested, revoked) are kept in an append-only events table so the shop has
-- a tamper-evident audit trail.
--
-- Session B adds per-line-item authorization on top of this (a separate
-- document_auth_items table) without changing the schema here.
--
-- Reuses the existing document_share_tokens mechanism — the token the
-- customer already has grants them the ability to submit a decision. No
-- separate auth-only token system.

CREATE TABLE document_authorizations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    document_id     uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'viewed', 'approved', 'denied', 'changes_requested', 'cancelled', 'expired', 'revised_required')),
    requested_at    timestamptz NOT NULL DEFAULT now(),
    requested_by    text NOT NULL DEFAULT '',
    viewed_at       timestamptz,
    responded_at    timestamptz,
    responded_name  text NOT NULL DEFAULT '',   -- what the customer typed as their name
    response_reason text NOT NULL DEFAULT '',   -- "why" for deny / changes requested, "notes" for approve
    customer_ip     text NOT NULL DEFAULT '',   -- for audit — never shown to the customer
    customer_ua     text NOT NULL DEFAULT '',   -- user agent at the moment of decision
    expires_at      timestamptz,                -- NULL = never expires until explicitly cancelled
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Only one ACTIVE (non-terminal) authorization per document at a time.
CREATE UNIQUE INDEX document_authorizations_one_active
    ON document_authorizations (document_id)
    WHERE status IN ('pending', 'viewed');
CREATE INDEX document_authorizations_company_status
    ON document_authorizations (company_id, status, updated_at DESC);

-- Append-only audit log of everything that happened to an authorization. We
-- never UPDATE rows in this table from normal UI operations.
CREATE TABLE document_auth_events (
    id               bigserial PRIMARY KEY,
    authorization_id uuid NOT NULL REFERENCES document_authorizations (id) ON DELETE CASCADE,
    document_id      uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    kind             text NOT NULL CHECK (kind IN (
        'requested', 'resent', 'viewed', 'approved', 'denied', 'changes_requested',
        'cancelled', 'expired', 'revised_required'
    )),
    actor            text NOT NULL DEFAULT '',   -- shop user name OR customer-supplied name
    actor_role       text NOT NULL DEFAULT '',   -- 'shop' or 'customer' or 'system'
    note             text NOT NULL DEFAULT '',
    ip               text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_auth_events_authz ON document_auth_events (authorization_id, created_at);
CREATE INDEX document_auth_events_company ON document_auth_events (company_id, created_at DESC);
