-- Phase C: track the Stripe customer + subscription ids on each tenant's
-- subscription row so the customer-portal link resolves without round-trips.
-- Idempotent — safe to re-run.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS stripe_customer_id     text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS stripe_subscription_id text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS subscriptions_stripe_sub_idx
    ON subscriptions (stripe_subscription_id)
    WHERE stripe_subscription_id <> '';
