-- Platform-level outbound email (SaaS owner's own noreply address).
--
-- Separate from the per-tenant notification_settings used by shops to email
-- their customers. This mailer sends FROM the platform TO shop owners for
-- transactional events the SaaS owner originates: new shop welcome, status
-- change, subscription renewal / expiration.
--
-- Singleton row keyed by a fixed boolean so there is at most one platform
-- mailer configuration. Password stored encrypted with TORQUEDESK_SECRET_KEY.

CREATE TABLE platform_mail_settings (
    singleton           boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
    smtp_host           text NOT NULL DEFAULT '',
    smtp_port           int NOT NULL DEFAULT 587,
    smtp_user           text NOT NULL DEFAULT '',
    smtp_password_enc   bytea,
    smtp_use_tls        boolean NOT NULL DEFAULT true,
    from_email          text NOT NULL DEFAULT '',
    from_name           text NOT NULL DEFAULT 'TorqueDesk',
    reply_to            text NOT NULL DEFAULT '',
    enabled             boolean NOT NULL DEFAULT false,
    notify_new_company      boolean NOT NULL DEFAULT true,
    notify_status_change    boolean NOT NULL DEFAULT true,
    notify_subscription     boolean NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_mail_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;
