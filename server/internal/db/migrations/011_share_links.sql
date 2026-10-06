-- Session B of Vehicle Inspection: customer-facing share link + per-document
-- "Include Inspection Report" toggle.
--
-- A share link is a long, unguessable token that grants READ-ONLY access to one
-- document (and, when enabled, its associated inspection) without any login.
-- Tokens live outside the document row so they can be rotated independently of
-- the document itself; revoking a token invalidates the link in O(1).
--
-- include_inspection on documents is three-valued: NULL = fall through to the
-- shop-wide default in document_preferences; TRUE/FALSE = per-document override.
-- Shop-wide default stored in document_preferences, defaults to TRUE.

CREATE TABLE document_share_tokens (
    token           text PRIMARY KEY,                             -- 32-byte base64url
    document_id     uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    created_by      text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz,
    last_viewed_at  timestamptz,
    view_count      integer NOT NULL DEFAULT 0
);
CREATE INDEX document_share_tokens_doc ON document_share_tokens (document_id);
CREATE INDEX document_share_tokens_company ON document_share_tokens (company_id);

-- Per-document override. NULL = inherit the shop default; TRUE/FALSE = override.
ALTER TABLE documents ADD COLUMN include_inspection boolean;

-- Shop-wide default. Lives in the existing singleton document_preferences table.
ALTER TABLE document_preferences ADD COLUMN include_inspection_default boolean NOT NULL DEFAULT true;
