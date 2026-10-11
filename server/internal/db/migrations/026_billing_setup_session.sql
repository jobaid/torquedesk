-- Idempotency marker for /api/me/billing/setup — if the shop clicks
-- Set up Stripe twice in a row (refresh mid-Stripe-redirect, for example)
-- we want the second click to return the SAME Checkout URL instead of
-- opening a fresh Stripe session that could end in a duplicate charge.
--
-- Cleared on successful setupBillingSync so a cancellation can restart.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS stripe_setup_session_id text NOT NULL DEFAULT '';
