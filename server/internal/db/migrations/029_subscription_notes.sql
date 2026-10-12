-- Subscriptions table was missing a 'notes' column that signup.go and
-- activation flows append to for audit (Stripe session + subscription IDs).
-- The 'notes' column lives on the companies table in migration 004 but
-- never got added to subscriptions. Add it now, idempotent.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
