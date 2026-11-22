-- Inbound contact / demo requests from the public marketing site
-- (www.fixoraerp.com/contact). The SaaS owner reviews them under
-- Owner → Demo Requests and can email the requester a signup link.
CREATE TABLE IF NOT EXISTS demo_requests (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    email             text NOT NULL,
    shop              text NOT NULL DEFAULT '',
    phone             text NOT NULL DEFAULT '',
    topic             text NOT NULL DEFAULT 'other',
    message           text NOT NULL DEFAULT '',
    status            text NOT NULL DEFAULT 'new',
    source_ip         text NOT NULL DEFAULT '',
    link_sent_at      timestamptz,
    link_sent_count   integer NOT NULL DEFAULT 0,
    link_sent_by      text NOT NULL DEFAULT '',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_requests_created_idx ON demo_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS demo_requests_status_idx ON demo_requests (status);
