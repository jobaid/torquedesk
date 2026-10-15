-- Vehicle Intelligence & Parts Pricing add-on.
--
-- Entitlement reuses existing company_features flags:
--   vehicle_history  → CARFAX
--   parts_pricing    → PartsTech / Advance / other merchant adapters
-- Routes in vintel.go call hasFeature() before accepting the request.
--
-- All credentials land encrypted (AES-GCM via api.Encrypt). Only the
-- display label (e.g. account name) is kept plaintext for the UI.

CREATE TABLE IF NOT EXISTS shop_merchant_connections (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    provider            text NOT NULL,                 -- 'carfax' | 'partstech' | 'advance' | ...
    account_label       text NOT NULL DEFAULT '',      -- shop-visible account id/name
    status              text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','connected','error','disconnected')),
    credentials_enc     bytea,                         -- encrypted blob; shape per-adapter
    last_check_at       timestamptz,
    last_error          text NOT NULL DEFAULT '',
    enabled             boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_merchant_conn_company ON shop_merchant_connections(company_id);

CREATE TABLE IF NOT EXISTS vehicle_history_report_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    vehicle_id      uuid,                              -- soft link; vehicles table may vary
    vin             text NOT NULL,
    provider        text NOT NULL DEFAULT 'carfax',
    status          text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','authorized','completed','failed','pending_authorization')),
    report_url      text NOT NULL DEFAULT '',          -- provider-hosted URL when available
    error_message   text NOT NULL DEFAULT '',
    requested_by    text NOT NULL DEFAULT '',
    requested_at    timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_vhr_company_vin ON vehicle_history_report_requests(company_id, vin);
CREATE INDEX IF NOT EXISTS idx_vhr_company_time ON vehicle_history_report_requests(company_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS parts_price_quotes (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    repair_order_id uuid,                              -- soft link
    vin            text NOT NULL DEFAULT '',
    search_term    text NOT NULL DEFAULT '',
    requested_by   text NOT NULL DEFAULT '',
    requested_at   timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pq_company_time ON parts_price_quotes(company_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS parts_quote_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id        uuid NOT NULL REFERENCES parts_price_quotes(id) ON DELETE CASCADE,
    provider        text NOT NULL,
    merchant_part_no text NOT NULL DEFAULT '',
    description     text NOT NULL DEFAULT '',
    classification  text NOT NULL DEFAULT '',          -- OEM | aftermarket
    fitment_note    text NOT NULL DEFAULT '',
    unit_price      numeric(10,2) NOT NULL DEFAULT 0,
    core_charge     numeric(10,2) NOT NULL DEFAULT 0,
    shipping        numeric(10,2) NOT NULL DEFAULT 0,
    fees            numeric(10,2) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'USD',
    availability    text NOT NULL DEFAULT '',
    delivery_est    text NOT NULL DEFAULT '',
    retrieved_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pqi_quote ON parts_quote_items(quote_id);

CREATE TABLE IF NOT EXISTS integration_audit_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
    actor_name  text NOT NULL DEFAULT '',
    provider    text NOT NULL DEFAULT '',
    action      text NOT NULL,                         -- connect|disconnect|report_request|price_lookup|error
    details     jsonb NOT NULL DEFAULT '{}'::jsonb,    -- never store secrets
    ip          text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intaudit_company_time ON integration_audit_logs(company_id, created_at DESC);
