-- Add customer_broadcast to Professional + Business + Enterprise plans so new
-- signups on those tiers get the feature automatically. Starter stays
-- without it. Idempotent — only appends when the key isn't already there.

UPDATE signup_plans
   SET features = features || ARRAY['customer_broadcast']
 WHERE key IN ('professional', 'business', 'enterprise')
   AND NOT ('customer_broadcast' = ANY(features));
