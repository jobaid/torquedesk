-- Shop subscribers (company_owners) get the same optional TOTP MFA as saas owners.
ALTER TABLE company_owners
  ADD COLUMN IF NOT EXISTS mfa_secret   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mfa_enabled  boolean NOT NULL DEFAULT false;
