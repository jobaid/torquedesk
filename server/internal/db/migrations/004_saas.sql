-- Phase-1 CuraNex SaaS owner portal.
-- Introduces a tenant model (companies) alongside the existing single-tenant app.
-- The existing data is NOT touched or scoped yet; tenant isolation on the main app
-- lands in a later phase. These tables stand on their own so the owner UI is useful.
--
-- Passwords for the owner portal use Argon2id (see auth.go / password.go).
-- No plaintext passwords are ever stored.

CREATE TABLE saas_admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE companies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code       text NOT NULL UNIQUE,
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  legal_name         text NOT NULL DEFAULT '',
  address_street     text NOT NULL DEFAULT '',
  address_city       text NOT NULL DEFAULT '',
  address_state      text NOT NULL DEFAULT '',
  address_zip        text NOT NULL DEFAULT '',
  address_country    text NOT NULL DEFAULT 'US',
  phone              text NOT NULL DEFAULT '',
  email              text NOT NULL DEFAULT '',
  website            text NOT NULL DEFAULT '',
  industry           text NOT NULL DEFAULT 'Automotive',
  timezone           text NOT NULL DEFAULT 'America/New_York',
  status             text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'cancelled', 'pending')),
  application_url    text NOT NULL DEFAULT '',
  custom_domain      text NOT NULL DEFAULT '',
  notes              text NOT NULL DEFAULT '',
  created_by         uuid REFERENCES saas_admin_users (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_status ON companies (status);

CREATE TABLE company_owners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  first_name    text NOT NULL,
  last_name     text NOT NULL DEFAULT '',
  email         text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  username      text NOT NULL,
  password_hash text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending_password_set')),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, username),
  UNIQUE (company_id, email)
);

CREATE TABLE subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL UNIQUE REFERENCES companies (id) ON DELETE CASCADE,
  plan            text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'business', 'enterprise')),
  status          text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'pending', 'suspended')),
  billing_cycle   text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  monthly_price   numeric(10, 2) NOT NULL DEFAULT 0,
  annual_price    numeric(10, 2) NOT NULL DEFAULT 0,
  start_date      date,
  end_date        date,
  trial_start     date,
  trial_end       date,
  auto_renewal    boolean NOT NULL DEFAULT false,
  payment_status  text NOT NULL DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'paid', 'failed', 'refunded')),
  external_customer_id      text NOT NULL DEFAULT '',
  external_subscription_id  text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_end_date ON subscriptions (end_date);

CREATE TABLE saas_audit_log (
  id              bigserial PRIMARY KEY,
  admin_user_id   uuid REFERENCES saas_admin_users (id),
  admin_name      text NOT NULL,
  action          text NOT NULL,
  target_type     text NOT NULL DEFAULT '',
  target_id       text NOT NULL DEFAULT '',
  company_id      uuid REFERENCES companies (id) ON DELETE SET NULL,
  details         jsonb,
  ip              text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saas_audit_created_at ON saas_audit_log (created_at DESC);
CREATE INDEX saas_audit_company ON saas_audit_log (company_id);
