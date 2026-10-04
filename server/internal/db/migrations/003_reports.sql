-- Server-side document totals, normalized lines/taxes/fees, a real payments table
-- and indexes for sales / payment / tax reporting.
-- All money is numeric(12,2); totals are computed in Go with exact decimals from
-- each document's frozen settings snapshot (see internal/api/totals.go).

ALTER TABLE documents
  ADD COLUMN invoiced_at      timestamptz,
  ADD COLUMN labor_total      numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN parts_total      numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN other_total      numeric(12, 2) NOT NULL DEFAULT 0, -- flat-fee / sublet lines
  ADD COLUMN shop_fees_total  numeric(12, 2) NOT NULL DEFAULT 0, -- HazMat, Shop Supplies, …
  ADD COLUMN discount_total   numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN subtotal         numeric(12, 2) NOT NULL DEFAULT 0, -- sales before tax
  ADD COLUMN tax_total        numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN total            numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN paid_total       numeric(12, 2) NOT NULL DEFAULT 0, -- net of refunds, excludes voided
  ADD COLUMN balance          numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN parts_cost_total numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN payment_status   text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'overpaid')),
  ADD COLUMN totals_version   integer NOT NULL DEFAULT 0;

-- Existing invoices: use their last update as the invoice date.
UPDATE documents SET invoiced_at = updated_at WHERE type = 'invoice';

CREATE TABLE document_lines (
  document_id  uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  line_no      integer NOT NULL,
  kind         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  part_number  text NOT NULL DEFAULT '',
  vendor       text NOT NULL DEFAULT '',
  quantity     numeric(12, 3) NOT NULL DEFAULT 0,
  unit_price   numeric(12, 2) NOT NULL DEFAULT 0,
  unit_cost    numeric(12, 2) NOT NULL DEFAULT 0,
  line_total   numeric(12, 2) NOT NULL DEFAULT 0,
  cost_total   numeric(12, 2) NOT NULL DEFAULT 0,
  procedure    text NOT NULL DEFAULT '',
  PRIMARY KEY (document_id, line_no)
);
CREATE INDEX document_lines_parts ON document_lines (kind, part_number);

CREATE TABLE document_taxes (
  document_id    uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  tax_id         bigint NOT NULL, -- id inside the document's snapshot (may no longer exist in tax_rates)
  name           text NOT NULL,
  rate           numeric(7, 4) NOT NULL,
  taxable_amount numeric(12, 2) NOT NULL,
  tax_amount     numeric(12, 2) NOT NULL,
  PRIMARY KEY (document_id, tax_id)
);

CREATE TABLE document_fees (
  document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  fee_id      bigint NOT NULL,
  name        text NOT NULL,
  amount      numeric(12, 2) NOT NULL,
  PRIMARY KEY (document_id, fee_id)
);

CREATE SEQUENCE payment_number_seq START 10001;

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number  bigint NOT NULL UNIQUE DEFAULT nextval('payment_number_seq'),
  document_id     uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  paid_at         timestamptz NOT NULL DEFAULT now(),
  method          text NOT NULL CHECK (method IN ('cash', 'check', 'credit_card', 'debit_card', 'financing', 'other')),
  amount          numeric(12, 2) NOT NULL CHECK (amount > 0),
  refunded_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount),
  check_number    text NOT NULL DEFAULT '',
  reference       text NOT NULL DEFAULT '',
  notes           text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partially_refunded', 'refunded', 'voided')),
  refunded_at     timestamptz,
  refund_reason   text NOT NULL DEFAULT '',
  voided_at       timestamptz,
  recorded_by     text NOT NULL DEFAULT 'system',
  updated_by      text NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_paid_at ON payments (paid_at);
CREATE INDEX payments_document ON payments (document_id);
CREATE INDEX payments_method ON payments (method, paid_at);

-- Move payments out of the documents JSON into the payments table.
INSERT INTO payments (document_id, paid_at, method, amount, reference, recorded_by, updated_by)
SELECT d.id,
       CASE WHEN (p ->> 'at') ~ '^[0-9]+$' THEN to_timestamp((p ->> 'at')::bigint / 1000.0) ELSE d.updated_at END,
       CASE lower(coalesce(p ->> 'method', ''))
         WHEN 'cash' THEN 'cash' WHEN 'check' THEN 'check' WHEN 'card' THEN 'credit_card'
         WHEN 'credit card' THEN 'credit_card' WHEN 'debit card' THEN 'debit_card'
         WHEN 'financing' THEN 'financing' ELSE 'other' END,
       round((p ->> 'amount')::numeric, 2),
       left(coalesce(p ->> 'ref', ''), 100),
       d.updated_by, d.updated_by
FROM documents d, jsonb_array_elements(d.payments) p
WHERE (p ->> 'amount') ~ '^[0-9]+(\.[0-9]+)?$' AND (p ->> 'amount')::numeric > 0;

ALTER TABLE documents DROP COLUMN payments;

-- Reporting indexes (sales are invoices filtered by invoice date)
CREATE INDEX documents_sales ON documents (invoiced_at) WHERE type = 'invoice';
CREATE INDEX documents_customer ON documents (customer_id);
CREATE INDEX documents_technician ON documents (technician_id);
CREATE INDEX documents_writer ON documents (writer_id);

-- Report exports are audited in the same log as settings changes.
ALTER TABLE settings_audit_log DROP CONSTRAINT settings_audit_log_action_check;
ALTER TABLE settings_audit_log ADD CONSTRAINT settings_audit_log_action_check CHECK (action IN ('create', 'update', 'delete', 'export'));
