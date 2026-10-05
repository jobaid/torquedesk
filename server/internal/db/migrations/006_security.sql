-- Security hardening phase.
--
-- 1) saas_admin_users: TOTP MFA fields. Keeps secret even when disabled so a
--    re-enable without re-scan is possible; mfa_enabled gates enforcement.
-- 2) password_reset_tokens: short-lived tokens for the forgot-password flow.
--    We only ever store the SHA-256 of the token so a DB leak doesn't give an
--    attacker working reset links. One table serves both saas_admin and
--    company_owner (user_kind discriminator).

ALTER TABLE saas_admin_users
  ADD COLUMN IF NOT EXISTS mfa_secret   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mfa_enabled  boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          bigserial PRIMARY KEY,
  user_kind   text NOT NULL CHECK (user_kind IN ('saas_admin', 'company_owner')),
  user_id     uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens (user_kind, user_id, expires_at DESC);
