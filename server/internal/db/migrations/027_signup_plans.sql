-- Editable subscription plans. The SaaS owner manages these from
-- Owner Portal → Plans (name, price, trial days, features bundle,
-- published/highlighted flags). Replaces the hardcoded map in
-- signup.go — Go code falls back to a sensible default only when the
-- table is unreachable.
--
-- Seeded with the previous Starter / Professional / Business tiers so
-- existing signup URLs and in-flight subscriptions keep working.

CREATE TABLE IF NOT EXISTS signup_plans (
    key           text PRIMARY KEY,
    name          text NOT NULL,
    tagline       text NOT NULL DEFAULT '',
    monthly_price numeric(10,2) NOT NULL CHECK (monthly_price >= 0),
    annual_price  numeric(10,2) NOT NULL CHECK (annual_price >= 0),
    trial_days    int NOT NULL DEFAULT 7 CHECK (trial_days >= 0 AND trial_days <= 365),
    features      text[] NOT NULL DEFAULT '{}',
    highlighted   boolean NOT NULL DEFAULT false,
    published     boolean NOT NULL DEFAULT true,
    display_order int NOT NULL DEFAULT 100,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO signup_plans (key, name, tagline, monthly_price, annual_price, trial_days, features, highlighted, display_order)
VALUES
    ('starter', 'Starter',
     'Everything a one-bay shop needs to run on paper no more.',
     49.00, 470.00, 7,
     ARRAY['dashboard','customers','vehicles','orders','invoices','payments','settings','share_link','online_payments','notifications'],
     false, 1),

    ('professional', 'Professional',
     'For growing shops that need customer approvals and tech workflows.',
     99.00, 950.00, 7,
     ARRAY['dashboard','customers','vehicles','orders','invoices','payments','settings','share_link','online_payments','notifications','inspections','inspection_photos','technician_submit','authorization','chat','payment_receipts','email_templates','reports','sales_reports','advanced_reports','parts_profit','payments_report','tax_report'],
     true, 2),

    ('business', 'Business',
     'Multi-tech shops with full automation and audit requirements.',
     199.00, 1900.00, 14,
     ARRAY['dashboard','customers','vehicles','orders','invoices','payments','settings','share_link','online_payments','notifications','inspections','inspection_photos','technician_submit','authorization','chat','payment_receipts','email_templates','reports','sales_reports','advanced_reports','parts_profit','payments_report','tax_report','backup','audit_log','mfa','password_reset','integrations_hub','void_documents','reopen_documents','deposit_payments','repair_info','diagnostics','dtc','wiring','maintenance','bulletins'],
     false, 3)
ON CONFLICT (key) DO NOTHING;
