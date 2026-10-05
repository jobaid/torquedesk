-- Customers move from browser localStorage to a per-tenant Postgres table.
-- Each row is scoped to one company_id. Vehicles are stored as a jsonb array
-- on the customer row (same shape the frontend already uses) so documents can
-- keep referencing them without a schema change.

CREATE TABLE IF NOT EXISTS customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  vehicles    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_company ON customers (company_id, name);
