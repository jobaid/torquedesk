-- Session B of Customer Authorization: per-line-item approval, and automatic
-- "revised authorization required" detection when the document changes after
-- the customer approved it.
--
-- A document_authorizations row now carries a scope_hash: a SHA-256 over the
-- line items + totals of the document AT THE MOMENT the request was created.
-- When the shop later edits the document, the API compares the current hash to
-- the stored one; if they differ AND the authorization is approved / denied /
-- changes_requested, the authorization is auto-flipped to 'revised_required'
-- and an event row is appended. The old approval history is preserved — a
-- future revision creates a NEW document_authorizations row with its own hash.

ALTER TABLE document_authorizations ADD COLUMN scope_hash text NOT NULL DEFAULT '';

CREATE TABLE document_auth_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    authorization_id uuid NOT NULL REFERENCES document_authorizations (id) ON DELETE CASCADE,
    item_key         text NOT NULL,                 -- stable id for the line in the document (items[].id or synthetic hash)
    label            text NOT NULL,                 -- what the customer sees ("Front brake pads")
    amount           numeric(12, 2) NOT NULL DEFAULT 0,
    position         integer NOT NULL DEFAULT 0,
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'denied')),
    responded_at     timestamptz,
    note             text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX document_auth_items_unique ON document_auth_items (authorization_id, item_key);
CREATE INDEX document_auth_items_status ON document_auth_items (authorization_id, status);
