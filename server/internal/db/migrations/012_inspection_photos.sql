-- Session D of Vehicle Inspection: photo attachments per inspection item.
--
-- Files live on disk (UPLOAD_DIR env var, default ./uploads) under
-- {UPLOAD_DIR}/{company_id}/{inspection_id}/{item_id}/{photo_id}{ext}.
-- Only metadata lives in the DB — never the bytes. This keeps the DB dumps
-- small and lets us swap to object storage later by changing the file store
-- interface without touching the schema.
--
-- Tenant isolation is enforced at the API layer by scoping every lookup
-- through the parent inspection's company_id. The DB cascades so deleting a
-- company or inspection removes photo rows (the API also deletes the files).

CREATE TABLE inspection_item_photos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         uuid NOT NULL REFERENCES inspection_items (id) ON DELETE CASCADE,
    inspection_id   uuid NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
    content_type    text NOT NULL,
    byte_size       bigint NOT NULL CHECK (byte_size > 0),
    width           integer NOT NULL DEFAULT 0,
    height          integer NOT NULL DEFAULT 0,
    position        integer NOT NULL DEFAULT 0,
    uploaded_by     text NOT NULL DEFAULT '',
    extension       text NOT NULL DEFAULT '',       -- stored for file path reconstruction
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspection_item_photos_item ON inspection_item_photos (item_id, position);
CREATE INDEX inspection_item_photos_inspection ON inspection_item_photos (inspection_id);
