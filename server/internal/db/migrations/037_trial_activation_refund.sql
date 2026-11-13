-- Track the $0.30 trial-activation one-time charge so the daily refund
-- ticker can refund it automatically 5 days after signup. All three
-- columns default to NULL and only get written on successful signup.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS trial_activation_pi           text,
    ADD COLUMN IF NOT EXISTS trial_activation_charged_at   timestamptz,
    ADD COLUMN IF NOT EXISTS trial_activation_refunded_at  timestamptz;

CREATE INDEX IF NOT EXISTS subscriptions_trial_act_refund_due
    ON subscriptions (trial_activation_charged_at)
 WHERE trial_activation_pi IS NOT NULL
   AND trial_activation_refunded_at IS NULL;
