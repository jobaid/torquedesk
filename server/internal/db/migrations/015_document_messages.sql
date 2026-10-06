-- Session C of Customer Authorization: two-way chat per document.
--
-- One thread per (document, company). Messages come from the shop (shop user)
-- or the customer (via the share token). Read-tracking is a pair of
-- timestamps on the document: last time the shop saw messages, and last time
-- the customer did (via GET on the public thread). Unread counts are derived
-- from those timestamps so there's no need for per-message read rows.

CREATE TABLE document_messages (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    document_id   uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    sender_role   text NOT NULL CHECK (sender_role IN ('shop', 'customer')),
    sender_name   text NOT NULL DEFAULT '',
    body          text NOT NULL CHECK (char_length(body) <= 4000),
    ip            text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_messages_doc_created ON document_messages (document_id, created_at);
CREATE INDEX document_messages_company     ON document_messages (company_id, created_at DESC);

-- Read-tracking lives on the document so a single UPDATE marks everything read
-- without touching any message rows.
ALTER TABLE documents ADD COLUMN shop_messages_read_at     timestamptz;
ALTER TABLE documents ADD COLUMN customer_messages_read_at timestamptz;
