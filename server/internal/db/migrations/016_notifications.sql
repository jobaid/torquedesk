-- Session D of Customer Authorization: expiration + reminder emails.
--
-- Per-tenant SMTP settings for sending reminders. Password is stored
-- encrypted with the same AES-GCM key used by payment-gateway secrets.
-- Shop-facing notifications remain in-app only (unread badges) in this
-- session — only customer-reminder email goes outbound.
--
-- authorizations.reminder_sent_at prevents the ticker from re-sending the
-- same reminder every tick while the request is still open.

CREATE TABLE notification_settings (
    company_id        uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
    smtp_host         text NOT NULL DEFAULT '',
    smtp_port         integer NOT NULL DEFAULT 587,
    smtp_user         text NOT NULL DEFAULT '',
    smtp_password_enc bytea,                                 -- AES-GCM encrypted
    smtp_use_tls      boolean NOT NULL DEFAULT true,
    from_email        text NOT NULL DEFAULT '',
    from_name         text NOT NULL DEFAULT '',
    reply_to          text NOT NULL DEFAULT '',
    reminders_enabled boolean NOT NULL DEFAULT false,
    reminder_days     integer NOT NULL DEFAULT 2 CHECK (reminder_days BETWEEN 1 AND 60),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_authorizations ADD COLUMN reminder_sent_at timestamptz;

-- Seed a row for every existing company so the Settings page can PATCH.
INSERT INTO notification_settings (company_id)
SELECT c.id FROM companies c
LEFT JOIN notification_settings n ON n.company_id = c.id
WHERE n.company_id IS NULL;
