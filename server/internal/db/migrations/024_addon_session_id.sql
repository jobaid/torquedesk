-- Track the Stripe Checkout session ID on each pending subscription so the
-- success-redirect verify path can look the subscription up directly,
-- bypassing the webhook when it's not configured or not reachable.

ALTER TABLE shop_addon_subscriptions
    ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NOT NULL DEFAULT '';
