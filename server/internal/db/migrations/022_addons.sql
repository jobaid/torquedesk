-- Add-on marketplace.
--
-- The SaaS owner defines purchasable add-ons (addon_catalog) that unlock
-- feature-flag keys for shops. Shops subscribe through Stripe Checkout in
-- subscription mode, with a 7-day free trial. Money goes to the SaaS owner's
-- Stripe account (saas_payment_methods), NOT the shop's own gateway.
--
-- Lifecycle: shop clicks Subscribe → Stripe Checkout → trial starts →
-- customer.subscription.created webhook flips features[key]=true. When the
-- shop cancels, Stripe keeps the subscription active until period end; our
-- webhook flips the flag off when customer.subscription.deleted arrives.

CREATE TABLE IF NOT EXISTS addon_catalog (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_key        text NOT NULL UNIQUE,
    name               text NOT NULL,
    description        text NOT NULL DEFAULT '',
    monthly_price      numeric(10,2) NOT NULL CHECK (monthly_price > 0),
    currency           text NOT NULL DEFAULT 'USD',
    trial_days         int NOT NULL DEFAULT 7 CHECK (trial_days >= 0 AND trial_days <= 90),
    stripe_product_id  text NOT NULL DEFAULT '',
    stripe_price_id    text NOT NULL DEFAULT '',
    published          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_addon_subscriptions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    addon_id              uuid NOT NULL REFERENCES addon_catalog (id) ON DELETE RESTRICT,
    feature_key           text NOT NULL,
    stripe_subscription_id text NOT NULL DEFAULT '',
    stripe_customer_id    text NOT NULL DEFAULT '',
    status                text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
    cancel_at_period_end  boolean NOT NULL DEFAULT false,
    current_period_end    timestamptz,
    trial_end             timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shop_addon_sub_one_per_feature
    ON shop_addon_subscriptions (company_id, feature_key)
    WHERE status NOT IN ('canceled', 'incomplete_expired', 'unpaid');

CREATE INDEX IF NOT EXISTS shop_addon_sub_stripe_idx
    ON shop_addon_subscriptions (stripe_subscription_id)
    WHERE stripe_subscription_id <> '';
