-- Session 1 of payment gateways: foundation only.
--
-- Shops bring their own Stripe / Authorize.Net accounts and we hand off to
-- hosted checkout — card data never touches our server (PCI SAQ-A). The SaaS
-- owner side has its own processor row that CuraNex uses to charge shops for
-- their subscription.
--
-- Secret keys are stored encrypted with AES-GCM; the key material is held in
-- the TORQUEDESK_SECRET_KEY env var and never written to the DB in plaintext.
-- When a provider is deleted or rotated the ciphertext column is replaced; we
-- never emit the plaintext back to the frontend (just a boolean + last-four).
--
-- No charges are created yet. Sessions 2 and 3 add the Checkout handoff
-- and webhook endpoints that fill in payment_intents / subscription_charges.

-- ----------------------------- shop-side ------------------------------------

CREATE TABLE shop_payment_gateways (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id               uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    provider                 text NOT NULL CHECK (provider IN ('stripe', 'authnet')),
    mode                     text NOT NULL CHECK (mode IN ('test', 'live')),
    display_name             text NOT NULL DEFAULT '',
    publishable_key          text NOT NULL DEFAULT '',            -- stripe pk_* / auth.net API Login ID (public)
    secret_last4             text NOT NULL DEFAULT '',            -- for UI hinting; never the full secret
    encrypted_secret_key     bytea,                               -- stripe sk_* / auth.net Transaction Key
    encrypted_webhook_secret bytea,                               -- stripe whsec_* / auth.net signature key
    active                   boolean NOT NULL DEFAULT false,
    verified_at              timestamptz,                         -- last time we round-tripped the provider API
    verification_error       text NOT NULL DEFAULT '',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shop_payment_gateways_one_per_provider
    ON shop_payment_gateways (company_id, provider);

CREATE TABLE shop_payment_intents (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    document_id   uuid REFERENCES documents (id) ON DELETE SET NULL,
    provider      text NOT NULL CHECK (provider IN ('stripe', 'authnet')),
    provider_ref  text NOT NULL,                                  -- stripe cs_*, auth.net transaction/token id
    amount        numeric(12, 2) NOT NULL CHECK (amount >= 0),
    currency      text NOT NULL DEFAULT 'USD',
    status        text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
    error_message text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_payment_intents_company_doc ON shop_payment_intents (company_id, document_id);
CREATE INDEX shop_payment_intents_provider_ref ON shop_payment_intents (provider, provider_ref);

-- ----------------------------- saas-side ------------------------------------

CREATE TABLE saas_payment_methods (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider                 text NOT NULL CHECK (provider IN ('stripe', 'authnet')),
    mode                     text NOT NULL CHECK (mode IN ('test', 'live')),
    display_name             text NOT NULL DEFAULT '',
    publishable_key          text NOT NULL DEFAULT '',
    secret_last4             text NOT NULL DEFAULT '',
    encrypted_secret_key     bytea,
    encrypted_webhook_secret bytea,
    active                   boolean NOT NULL DEFAULT false,
    verified_at              timestamptz,
    verification_error       text NOT NULL DEFAULT '',
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saas_payment_methods_one_per_provider
    ON saas_payment_methods (provider);

CREATE TABLE saas_subscription_charges (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    provider        text NOT NULL CHECK (provider IN ('stripe', 'authnet')),
    provider_ref    text NOT NULL,
    amount          numeric(12, 2) NOT NULL CHECK (amount >= 0),
    currency        text NOT NULL DEFAULT 'USD',
    status          text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
    error_message   text NOT NULL DEFAULT '',
    charged_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saas_subscription_charges_subscription ON saas_subscription_charges (subscription_id, created_at DESC);

-- ------------------------- webhook event ledger -----------------------------
-- One row per inbound webhook event. provider+event_id is unique so if the
-- provider retries we recognise and skip the duplicate instead of double-posting
-- the payment.

CREATE TABLE webhook_events (
    id            bigserial PRIMARY KEY,
    scope         text NOT NULL CHECK (scope IN ('shop', 'saas')),
    provider      text NOT NULL CHECK (provider IN ('stripe', 'authnet')),
    event_id      text NOT NULL,
    event_type    text NOT NULL DEFAULT '',
    company_id    uuid REFERENCES companies (id) ON DELETE SET NULL,
    received_at   timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz,
    status        text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'skipped', 'failed')),
    error_message text NOT NULL DEFAULT '',
    raw           jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX webhook_events_dedupe ON webhook_events (provider, event_id);
CREATE INDEX webhook_events_scope_received ON webhook_events (scope, received_at DESC);
