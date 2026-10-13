-- Technical Support / Service Desk. Idempotent.

CREATE TABLE IF NOT EXISTS support_tickets (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number        text NOT NULL UNIQUE,
    company_id           uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    submitter_name       text NOT NULL,
    submitter_email      text NOT NULL,
    subject              text NOT NULL,
    description          text NOT NULL,
    category             text NOT NULL DEFAULT 'other',
    priority             text NOT NULL DEFAULT 'normal'
                             CHECK (priority IN ('low','normal','high','urgent')),
    status               text NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','assigned','in_progress','awaiting_customer','awaiting_internal','resolved','closed')),
    affected_module      text NOT NULL DEFAULT '',
    error_message        text NOT NULL DEFAULT '',
    steps_to_reproduce   text NOT NULL DEFAULT '',
    expected_result      text NOT NULL DEFAULT '',
    actual_result        text NOT NULL DEFAULT '',
    assigned_admin_id    uuid REFERENCES saas_admin_users (id) ON DELETE SET NULL,
    assigned_admin_name  text NOT NULL DEFAULT '',
    first_response_at    timestamptz,
    resolved_at          timestamptz,
    closed_at            timestamptz,
    sla_response_due_at  timestamptz,
    sla_resolve_due_at   timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_company_idx ON support_tickets (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx  ON support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_assignee_idx ON support_tickets (assigned_admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id     uuid NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
    author_type   text NOT NULL CHECK (author_type IN ('shop','owner','system')),
    author_name   text NOT NULL,
    author_email  text NOT NULL DEFAULT '',
    body          text NOT NULL,
    visibility    text NOT NULL DEFAULT 'public'
                      CHECK (visibility IN ('public','internal')),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS support_audit (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    uuid NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
    actor_name   text NOT NULL,
    actor_type   text NOT NULL DEFAULT 'owner',
    action       text NOT NULL,
    from_value   text NOT NULL DEFAULT '',
    to_value     text NOT NULL DEFAULT '',
    note         text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_audit_ticket_idx ON support_audit (ticket_id, created_at);

-- Per-day counter for ticket numbers. INSERT .. ON CONFLICT DO UPDATE .. RETURNING
-- gives us a concurrency-safe atomic increment.
CREATE TABLE IF NOT EXISTS support_ticket_counters (
    day        date PRIMARY KEY,
    next_seq   int  NOT NULL
);
