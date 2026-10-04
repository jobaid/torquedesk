-- TorqueDesk settings + documents schema.
-- Single-row settings tables use id = 1 with a CHECK so there is exactly one row.

CREATE TABLE app_secrets (
  name  text PRIMARY KEY,
  value bytea NOT NULL
);

-- ---------------------------------------------------------------- Shop
CREATE TABLE shop_settings (
  id                     smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name              text NOT NULL DEFAULT '',
  address1               text NOT NULL DEFAULT '',
  address2               text NOT NULL DEFAULT '',
  city                   text NOT NULL DEFAULT '',
  state                  text NOT NULL DEFAULT '',
  zip                    text NOT NULL DEFAULT '',
  country                text NOT NULL DEFAULT 'United States',
  phone                  text NOT NULL DEFAULT '',
  phone2                 text NOT NULL DEFAULT '',
  email                  text NOT NULL DEFAULT '',
  website                text NOT NULL DEFAULT '',
  description            text NOT NULL DEFAULT '',
  display_part_details   boolean NOT NULL DEFAULT true,
  display_markup_details boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL DEFAULT 'system',
  updated_by             text NOT NULL DEFAULT 'system'
);

CREATE TABLE shop_licenses (
  id              bigserial PRIMARY KEY,
  type            text NOT NULL CHECK (type IN ('license', 'certification', 'registration', 'other')),
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  number          text NOT NULL DEFAULT '',
  issuing_org     text NOT NULL DEFAULT '',
  issue_date      date,
  expiration_date date,
  notes           text NOT NULL DEFAULT '',
  document_name   text,
  document_mime   text,
  document_size   integer,
  document_data   bytea,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text NOT NULL DEFAULT 'system',
  updated_by      text NOT NULL DEFAULT 'system',
  CHECK (issue_date IS NULL OR expiration_date IS NULL OR expiration_date >= issue_date)
);

CREATE TABLE shop_service_writers (
  id           bigserial PRIMARY KEY,
  first_name   text NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name    text NOT NULL DEFAULT '',
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  employee_id  text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  notes        text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text NOT NULL DEFAULT 'system',
  updated_by   text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX shop_service_writers_employee_id ON shop_service_writers (lower(employee_id)) WHERE employee_id <> '';

CREATE TABLE shop_technicians (
  id            bigserial PRIMARY KEY,
  first_name    text NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name     text NOT NULL DEFAULT '',
  display_name  text NOT NULL CHECK (length(trim(display_name)) > 0),
  employee_id   text NOT NULL DEFAULT '',
  technician_id text NOT NULL DEFAULT '',
  phone         text NOT NULL DEFAULT '',
  email         text NOT NULL DEFAULT '',
  certification text NOT NULL DEFAULT '',
  specialty     text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NOT NULL DEFAULT 'system',
  updated_by    text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX shop_technicians_employee_id ON shop_technicians (lower(employee_id)) WHERE employee_id <> '';
CREATE UNIQUE INDEX shop_technicians_technician_id ON shop_technicians (lower(technician_id)) WHERE technician_id <> '';

-- ---------------------------------------------------------------- Financial
CREATE TABLE labor_rates (
  id             bigserial PRIMARY KEY,
  rate           numeric(10, 2) NOT NULL CHECK (rate > 0 AND rate < 10000),
  currency       char(3) NOT NULL DEFAULT 'USD',
  effective_date date NOT NULL DEFAULT current_date,
  active         boolean NOT NULL DEFAULT false,
  notes          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text NOT NULL DEFAULT 'system',
  updated_by     text NOT NULL DEFAULT 'system'
);
-- At most one active labor rate
CREATE UNIQUE INDEX labor_rates_one_active ON labor_rates ((true)) WHERE active;

CREATE TABLE tax_rates (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL CHECK (length(trim(name)) > 0),
  rate          numeric(7, 4) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  description   text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  is_default    boolean NOT NULL DEFAULT false,
  applies_parts boolean NOT NULL DEFAULT true,
  applies_labor boolean NOT NULL DEFAULT false,
  applies_fees  boolean NOT NULL DEFAULT false,
  sort          integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NOT NULL DEFAULT 'system',
  updated_by    text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX tax_rates_name ON tax_rates (lower(name));

CREATE TABLE markup_settings (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  applies_to  text NOT NULL CHECK (applies_to IN ('parts', 'labor', 'other')),
  calc_type   text NOT NULL CHECK (calc_type IN ('percent', 'amount')),
  percentage  numeric(7, 3) NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 1000),
  amount      numeric(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  active      boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT 'system',
  updated_by  text NOT NULL DEFAULT 'system'
);
-- One active markup per category keeps pricing unambiguous
CREATE UNIQUE INDEX markup_settings_one_active ON markup_settings (applies_to) WHERE active;

CREATE TABLE shop_fees (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  active      boolean NOT NULL DEFAULT true,
  calc_by     text NOT NULL CHECK (calc_by IN ('amount', 'percent')),
  amount      numeric(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  percentage  numeric(7, 3) NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  minimum     numeric(10, 2) CHECK (minimum >= 0),
  maximum     numeric(10, 2) CHECK (maximum >= 0),
  applies_to  text NOT NULL DEFAULT 'labor_parts' CHECK (applies_to IN ('labor', 'parts', 'labor_parts')),
  taxable     boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  sort        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT 'system',
  updated_by  text NOT NULL DEFAULT 'system',
  CHECK (minimum IS NULL OR maximum IS NULL OR minimum <= maximum)
);
CREATE UNIQUE INDEX shop_fees_name ON shop_fees (lower(name));

-- ---------------------------------------------------------------- Documents
CREATE TABLE document_number_settings (
  doc_type    text PRIMARY KEY CHECK (doc_type IN ('estimate', 'repair_order', 'invoice', 'statement')),
  prefix      text NOT NULL DEFAULT '' CHECK (length(prefix) <= 8),
  next_number bigint NOT NULL CHECK (next_number > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT 'system',
  updated_by  text NOT NULL DEFAULT 'system'
);

CREATE TABLE document_preferences (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_odometer_unit text NOT NULL DEFAULT 'mi' CHECK (default_odometer_unit IN ('mi', 'km')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text NOT NULL DEFAULT 'system',
  updated_by            text NOT NULL DEFAULT 'system'
);

CREATE TABLE printing_settings (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paper_size      text NOT NULL DEFAULT 'letter' CHECK (paper_size IN ('letter', 'a4')),
  logo_name       text,
  logo_mime       text CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  logo_size       integer,
  logo_data       bytea,
  logo_updated_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text NOT NULL DEFAULT 'system',
  updated_by      text NOT NULL DEFAULT 'system'
);

CREATE TABLE document_options (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  show_part_numbers    boolean NOT NULL DEFAULT true,
  show_labor_rates     boolean NOT NULL DEFAULT true,
  show_technician      boolean NOT NULL DEFAULT true,
  show_promised_date   boolean NOT NULL DEFAULT true,
  save_parts_default   boolean NOT NULL DEFAULT false,
  show_payment_methods boolean NOT NULL DEFAULT true,
  payment_methods      text[] NOT NULL DEFAULT '{cash,check,credit_card,debit_card,financing}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           text NOT NULL DEFAULT 'system',
  updated_by           text NOT NULL DEFAULT 'system',
  CHECK (payment_methods <@ ARRAY['cash', 'check', 'credit_card', 'debit_card', 'financing', 'other']::text[])
);

CREATE TABLE estimate_settings (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  validity_days integer NOT NULL DEFAULT 14 CHECK (validity_days BETWEEN 1 AND 365),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NOT NULL DEFAULT 'system',
  updated_by    text NOT NULL DEFAULT 'system'
);

CREATE TABLE document_header_footer (
  id                       smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  header_show_logo         boolean NOT NULL DEFAULT true,
  header_show_name         boolean NOT NULL DEFAULT true,
  header_show_address      boolean NOT NULL DEFAULT true,
  header_show_phone        boolean NOT NULL DEFAULT true,
  header_show_email        boolean NOT NULL DEFAULT true,
  header_show_website      boolean NOT NULL DEFAULT false,
  header_layout            text NOT NULL DEFAULT 'logo_left' CHECK (header_layout IN ('logo_left', 'logo_center', 'logo_right')),
  header_custom_text       text NOT NULL DEFAULT '',
  footer_custom_text       text NOT NULL DEFAULT '',
  footer_show_licenses     boolean NOT NULL DEFAULT true,
  footer_show_certifications boolean NOT NULL DEFAULT true,
  footer_show_registrations  boolean NOT NULL DEFAULT false,
  payment_instructions     text NOT NULL DEFAULT '',
  warranty_text            text NOT NULL DEFAULT '',
  custom_notes             text NOT NULL DEFAULT '',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               text NOT NULL DEFAULT 'system',
  updated_by               text NOT NULL DEFAULT 'system'
);

-- Documents: estimates, repair orders, invoices, statements.
-- settings_snapshot freezes the financial/display settings in force at creation.
CREATE TABLE documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number_type        text NOT NULL REFERENCES document_number_settings (doc_type),
  number             bigint NOT NULL CHECK (number > 0),
  display_number     text NOT NULL,
  type               text NOT NULL CHECK (type IN ('estimate', 'repair_order', 'invoice', 'statement')),
  status             text NOT NULL DEFAULT 'open',
  customer_id        text NOT NULL DEFAULT '',
  customer_snapshot  jsonb,
  vehicle_id         text NOT NULL DEFAULT '',
  vehicle_snapshot   jsonb,
  writer_id          bigint REFERENCES shop_service_writers (id) ON DELETE RESTRICT,
  writer_name        text NOT NULL DEFAULT '',
  technician_id      bigint REFERENCES shop_technicians (id) ON DELETE RESTRICT,
  technician_name    text NOT NULL DEFAULT '',
  promised_at        text NOT NULL DEFAULT '',
  mileage_in         text NOT NULL DEFAULT '',
  mileage_out        text NOT NULL DEFAULT '',
  odometer_unit      text NOT NULL CHECK (odometer_unit IN ('mi', 'km')),
  tag                text NOT NULL DEFAULT '',
  shop_note          text NOT NULL DEFAULT '',
  save_parts         boolean NOT NULL DEFAULT false,
  payment_methods    text[] NOT NULL DEFAULT '{}',
  estimate_date      date,
  expires_at         date,
  authorization_info jsonb,
  items              jsonb NOT NULL DEFAULT '[]',
  payments           jsonb NOT NULL DEFAULT '[]',
  tax_ids            bigint[] NOT NULL DEFAULT '{}',
  fees_off           bigint[] NOT NULL DEFAULT '{}',
  settings_snapshot  jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         text NOT NULL DEFAULT 'system',
  updated_by         text NOT NULL DEFAULT 'system',
  UNIQUE (number_type, number),
  UNIQUE (display_number)
);
CREATE INDEX documents_updated_at ON documents (updated_at DESC);

-- ---------------------------------------------------------------- Audit
CREATE TABLE settings_audit_log (
  id         bigserial PRIMARY KEY,
  user_name  text NOT NULL,
  user_role  text NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL DEFAULT '',
  action     text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  field      text NOT NULL DEFAULT '',
  old_value  text,
  new_value  text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX settings_audit_log_created ON settings_audit_log (created_at DESC);
