-- Phase-3 session 1: multi-tenant isolation at the data layer.
--
-- Every tenant-scoped table gets a company_id FK. Existing rows are backfilled
-- to a seed "demo" company so no data is lost. Singleton settings tables stop
-- being single-row (id = 1) and instead key on company_id. Unique indexes that
-- used to be global (e.g. tax rate name) become per-tenant.
--
-- After this migration, every data query in the Go API MUST scope by the
-- authenticated user's company_id. Without that scope the query will return
-- data from other tenants; the code in internal/api/tenancy.go wraps this up
-- so handlers can't forget by accident.
--
-- company_owners.role is added so that table can serve as the shop-user login
-- source (phase-1 only had owner records; now they can actually sign in).
--
-- A company_features table lets the SaaS owner later toggle feature access
-- per company. Defaults enable every module; the UI/API enforcement arrives
-- in a later session.

-- ---------------------------------------------------------------------------
-- Seed company for existing single-tenant data.
-- ---------------------------------------------------------------------------
INSERT INTO companies (company_code, slug, name, legal_name, status, application_url, industry, timezone, notes)
VALUES ('DEMO-SHOP-001', 'demo', 'Demo Shop', 'TorqueDesk Demo Shop', 'active', '/', 'Automotive', 'America/New_York',
	'Automatically created to backfill all pre-tenancy data. You may rename or repurpose this company.')
ON CONFLICT (company_code) DO NOTHING;

-- Grab the demo company id into a session variable so the backfill is consistent
DO $$
DECLARE demo uuid;
BEGIN
	SELECT id INTO demo FROM companies WHERE company_code = 'DEMO-SHOP-001';
	PERFORM set_config('torquedesk.demo_company', demo::text, false);
END $$;

-- ---------------------------------------------------------------------------
-- Documents + lines/taxes/fees/payments
-- ---------------------------------------------------------------------------
ALTER TABLE documents ADD COLUMN company_id uuid REFERENCES companies (id);
UPDATE documents SET company_id = current_setting('torquedesk.demo_company')::uuid;
ALTER TABLE documents ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX documents_company ON documents (company_id);
-- display_number used to be globally unique; now per-tenant.
ALTER TABLE documents DROP CONSTRAINT documents_display_number_key;
ALTER TABLE documents ADD CONSTRAINT documents_display_number_key UNIQUE (company_id, display_number);
ALTER TABLE documents DROP CONSTRAINT documents_number_type_number_key;
ALTER TABLE documents ADD CONSTRAINT documents_number_type_number_key UNIQUE (company_id, number_type, number);

-- payments: denormalized company_id for fast scoping without always joining documents
ALTER TABLE payments ADD COLUMN company_id uuid REFERENCES companies (id);
UPDATE payments p SET company_id = d.company_id FROM documents d WHERE d.id = p.document_id;
ALTER TABLE payments ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX payments_company ON payments (company_id, paid_at);

-- document_lines / document_taxes / document_fees: scoped via document_id FK;
-- adding redundant company_id would just invite drift.

-- ---------------------------------------------------------------------------
-- Settings tables.
-- ---------------------------------------------------------------------------

-- Singleton settings: drop the single-row (id = 1) constraint, replace with
-- company_id as the primary key.
DO $$
DECLARE t text; demo uuid := current_setting('torquedesk.demo_company')::uuid;
BEGIN
	FOREACH t IN ARRAY ARRAY[
		'shop_settings','document_preferences','printing_settings',
		'document_options','estimate_settings','document_header_footer']
	LOOP
		EXECUTE format('ALTER TABLE %I ADD COLUMN company_id uuid REFERENCES companies(id)', t);
		EXECUTE format('UPDATE %I SET company_id = %L', t, demo);
		EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL', t);
		-- Drop the old id=1 primary key + CHECK (they're the ones named like 'tablename_pkey' and 'tablename_id_check').
		EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, t || '_pkey');
		EXECUTE format('ALTER TABLE %I DROP COLUMN id', t);
		EXECUTE format('ALTER TABLE %I ADD PRIMARY KEY (company_id)', t);
	END LOOP;
END $$;

-- List settings: add company_id, backfill, enforce NOT NULL + FK.
DO $$
DECLARE t text; demo uuid := current_setting('torquedesk.demo_company')::uuid;
BEGIN
	FOREACH t IN ARRAY ARRAY[
		'shop_licenses','shop_service_writers','shop_technicians',
		'labor_rates','tax_rates','markup_settings','shop_fees']
	LOOP
		EXECUTE format('ALTER TABLE %I ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE CASCADE', t);
		EXECUTE format('UPDATE %I SET company_id = %L', t, demo);
		EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL', t);
		EXECUTE format('CREATE INDEX %I ON %I (company_id)', t || '_company', t);
	END LOOP;
END $$;

-- Per-tenant uniqueness on previously-global names.
DROP INDEX tax_rates_name;
CREATE UNIQUE INDEX tax_rates_name ON tax_rates (company_id, lower(name));
DROP INDEX shop_fees_name;
CREATE UNIQUE INDEX shop_fees_name ON shop_fees (company_id, lower(name));

DROP INDEX shop_service_writers_employee_id;
CREATE UNIQUE INDEX shop_service_writers_employee_id ON shop_service_writers (company_id, lower(employee_id)) WHERE employee_id <> '';
DROP INDEX shop_technicians_employee_id;
CREATE UNIQUE INDEX shop_technicians_employee_id ON shop_technicians (company_id, lower(employee_id)) WHERE employee_id <> '';
DROP INDEX shop_technicians_technician_id;
CREATE UNIQUE INDEX shop_technicians_technician_id ON shop_technicians (company_id, lower(technician_id)) WHERE technician_id <> '';

-- One active labor rate / markup per company (was: globally).
DROP INDEX labor_rates_one_active;
CREATE UNIQUE INDEX labor_rates_one_active ON labor_rates (company_id) WHERE active;
DROP INDEX markup_settings_one_active;
CREATE UNIQUE INDEX markup_settings_one_active ON markup_settings (company_id, applies_to) WHERE active;

-- document_number_settings: PK was doc_type; now (company_id, doc_type).
ALTER TABLE documents DROP CONSTRAINT documents_number_type_fkey;
ALTER TABLE document_number_settings ADD COLUMN company_id uuid REFERENCES companies (id) ON DELETE CASCADE;
UPDATE document_number_settings SET company_id = current_setting('torquedesk.demo_company')::uuid;
ALTER TABLE document_number_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE document_number_settings DROP CONSTRAINT document_number_settings_pkey;
ALTER TABLE document_number_settings ADD PRIMARY KEY (company_id, doc_type);
ALTER TABLE documents ADD CONSTRAINT documents_number_type_fkey FOREIGN KEY (company_id, number_type) REFERENCES document_number_settings (company_id, doc_type);

-- Audit log: scope to a company so each tenant only sees their own history.
ALTER TABLE settings_audit_log ADD COLUMN company_id uuid REFERENCES companies (id);
UPDATE settings_audit_log SET company_id = current_setting('torquedesk.demo_company')::uuid;
ALTER TABLE settings_audit_log ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX settings_audit_log_company ON settings_audit_log (company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- company_owners becomes the shop-user login source: add a role column so a
-- company can have more than just an "owner" (manager/technician/etc).
-- ---------------------------------------------------------------------------
ALTER TABLE company_owners ADD COLUMN role text NOT NULL DEFAULT 'shop_owner'
	CHECK (role IN ('shop_owner', 'manager', 'advisor', 'technician', 'apprentice'));

-- ---------------------------------------------------------------------------
-- Per-tenant feature flags. Defaults enable the modules the app ships today;
-- SaaS owner can later turn these off per company to gate access.
-- ---------------------------------------------------------------------------
CREATE TABLE company_features (
	company_id uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
	features   jsonb NOT NULL DEFAULT '{
		"dashboard": true, "customers": true, "vehicles": true,
		"orders": true, "invoices": true, "payments": true,
		"inventory": true, "parts": true,
		"reports": true, "sales_reports": true, "advanced_reports": false,
		"accounting": false, "payroll": false, "settings": true
	}'::jsonb,
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the demo company's feature flags
INSERT INTO company_features (company_id)
SELECT id FROM companies WHERE company_code = 'DEMO-SHOP-001'
ON CONFLICT (company_id) DO NOTHING;

-- Seed per-company default settings for ANY existing companies that don't yet
-- have them (new companies get these via api.InitCompanyDefaults at creation).
INSERT INTO shop_settings (company_id) SELECT c.id FROM companies c LEFT JOIN shop_settings s ON s.company_id = c.id WHERE s.company_id IS NULL;
INSERT INTO document_preferences (company_id) SELECT c.id FROM companies c LEFT JOIN document_preferences s ON s.company_id = c.id WHERE s.company_id IS NULL;
INSERT INTO printing_settings (company_id) SELECT c.id FROM companies c LEFT JOIN printing_settings s ON s.company_id = c.id WHERE s.company_id IS NULL;
INSERT INTO document_options (company_id) SELECT c.id FROM companies c LEFT JOIN document_options s ON s.company_id = c.id WHERE s.company_id IS NULL;
INSERT INTO estimate_settings (company_id) SELECT c.id FROM companies c LEFT JOIN estimate_settings s ON s.company_id = c.id WHERE s.company_id IS NULL;
INSERT INTO document_header_footer (company_id) SELECT c.id FROM companies c LEFT JOIN document_header_footer s ON s.company_id = c.id WHERE s.company_id IS NULL;
-- Document numbering for all four doc types for any company missing them
INSERT INTO document_number_settings (company_id, doc_type, prefix, next_number)
SELECT c.id, dt.doc_type, '', 10001
FROM companies c
CROSS JOIN (VALUES ('estimate'), ('repair_order'), ('invoice'), ('statement')) AS dt(doc_type)
LEFT JOIN document_number_settings s ON s.company_id = c.id AND s.doc_type = dt.doc_type
WHERE s.company_id IS NULL;
INSERT INTO company_features (company_id) SELECT c.id FROM companies c LEFT JOIN company_features f ON f.company_id = c.id WHERE f.company_id IS NULL;

-- A default active labor rate for any company that still has none, so document
-- creation works out of the box (buildSnapshot refuses without an active rate).
INSERT INTO labor_rates (company_id, rate, currency, effective_date, active, notes, created_by, updated_by)
SELECT c.id, 125.00, 'USD', current_date, true,
	'Default rate created by the multi-tenancy migration. Change in Settings → Financial.', 'system', 'system'
FROM companies c LEFT JOIN labor_rates l ON l.company_id = c.id AND l.active
WHERE l.id IS NULL;
