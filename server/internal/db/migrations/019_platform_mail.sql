-- Platform-level outbound email (SaaS owner's own noreply address).
-- Idempotent — safe to re-run on partial earlier state.

CREATE TABLE IF NOT EXISTS platform_mail_settings (
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
