-- Two constraints were blocking the self-serve signup flow:
--
-- 1. subscriptions.plan was fixed to ('starter','professional','business',
--    'enterprise'). The Owner-managed Plans editor can create arbitrary
--    plan keys ('elite', 'solo', etc) and those failed the CHECK on insert.
--    Drop that check — plan values are validated against signup_plans
--    at the Go layer instead.
--
-- 2. company_owners.status only allowed ('active','disabled',
--    'pending_password_set'). The signup flow inserts 'pending' before
--    Stripe confirms payment, which also failed the CHECK. Expand the
--    allowed set to include 'pending' and 'inactive' (used by owner
--    updateCompanyOwner).

-- Drop the plan CHECK on subscriptions (if present under its default name).
DO $$ BEGIN
    EXECUTE 'ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_check';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Replace the company_owners.status CHECK with a broader set.
DO $$ BEGIN
    EXECUTE 'ALTER TABLE company_owners DROP CONSTRAINT company_owners_status_check';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE company_owners
    ADD CONSTRAINT company_owners_status_check
    CHECK (status IN ('active', 'disabled', 'pending', 'pending_password_set', 'inactive'));
