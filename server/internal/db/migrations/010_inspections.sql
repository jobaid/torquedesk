-- Session A of the Vehicle Inspection feature: schema for digital DVI-style
-- multi-point inspections. Each inspection belongs to a customer+vehicle in
-- one tenant and may optionally be attached to a document (estimate / repair
-- order / invoice) so the customer-facing share link can later include the
-- inspection alongside the financial document.
--
-- Session A does NOT include:
--   - photo uploads  (deferred to Session D — needs file/asset storage layer)
--   - public share links  (Session B — tokenized read-only route)
--   - combined PDF  (Session C — print view redesign)
--
-- Later sessions ADD columns / tables; they do not change the ones here.

CREATE TABLE inspections (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    customer_id       uuid REFERENCES customers (id) ON DELETE SET NULL,
    vehicle_id        text NOT NULL DEFAULT '',              -- jsonb vehicle id inside customers.vehicles
    document_id       uuid REFERENCES documents (id) ON DELETE SET NULL,
    status            text NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    mileage           integer NOT NULL DEFAULT 0,
    performed_by      text NOT NULL DEFAULT '',
    performed_at      timestamptz,
    notes             text NOT NULL DEFAULT '',
    -- Rolled-up counts kept here so the list view is one query, not one per row.
    pass_count        integer NOT NULL DEFAULT 0,
    attention_count   integer NOT NULL DEFAULT 0,
    fail_count        integer NOT NULL DEFAULT 0,
    na_count          integer NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspections_company_updated ON inspections (company_id, updated_at DESC);
CREATE INDEX inspections_customer         ON inspections (company_id, customer_id);
CREATE INDEX inspections_vehicle          ON inspections (company_id, vehicle_id)
    WHERE vehicle_id <> '';
CREATE INDEX inspections_document         ON inspections (document_id)
    WHERE document_id IS NOT NULL;

CREATE TABLE inspection_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id   uuid NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
    category        text NOT NULL,
    label           text NOT NULL,
    status          text NOT NULL DEFAULT 'na'
                    CHECK (status IN ('pass', 'attention', 'fail', 'na')),
    severity        text NOT NULL DEFAULT 'low'
                    CHECK (severity IN ('low', 'medium', 'high')),
    note            text NOT NULL DEFAULT '',
    measurement     text NOT NULL DEFAULT '',   -- e.g. "7/32 in" tread depth, "11.6 V" battery
    position        integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspection_items_inspection ON inspection_items (inspection_id, position);
