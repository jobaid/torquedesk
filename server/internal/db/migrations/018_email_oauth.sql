-- OAuth tokens for Gmail / Microsoft SMTP (XOAUTH2).
--
-- Per tenant + provider the refresh_token is stored encrypted at rest
-- (TORQUEDESK_SECRET_KEY) and used to mint fresh access tokens on each send.
-- The last access token is cached with its expiry so a run of 3-4 sends in
-- a row can skip the refresh round-trip.
--
-- 'email' is the account the user actually authenticated as — displayed in
-- the UI as 'Connected: shop@gmail.com' and used as the From-address when
-- the shop hasn't set one explicitly.
--
-- One row per (company_id, provider). Replacing a connection updates in
-- place rather than growing history.

CREATE TABLE email_oauth_tokens (
    company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    provider            text NOT NULL CHECK (provider IN ('google', 'microsoft')),
    email               text NOT NULL,
    refresh_token_enc   bytea NOT NULL,
    access_token_enc    bytea,
    access_expires_at   timestamptz,
    scope               text NOT NULL DEFAULT '',
    connected_by        text NOT NULL DEFAULT '',
    connected_at        timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, provider)
);
