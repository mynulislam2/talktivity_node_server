-- Migration: Update Plan Durations, Talk Times, and Free Trial Configuration
-- Date: 2026-02-23
-- Description: Update subscription plans to reflect new duration (8 weeks = 56 days)
-- and 3-day free trial

-- Update subscription_plans table with new durations
UPDATE subscription_plans 
SET 
  duration_days = 56,  -- 8 weeks instead of 12 weeks
  updated_at = CURRENT_TIMESTAMP
WHERE plan_type = 'Basic' AND is_active = true;

UPDATE subscription_plans 
SET 
  duration_days = 56,  -- 8 weeks instead of 12 weeks
  updated_at = CURRENT_TIMESTAMP
WHERE plan_type = 'Pro' AND is_active = true;

-- Update FreeTrial plan if it exists
UPDATE subscription_plans 
SET 
  duration_days = 3,  -- 3 days free trial
  updated_at = CURRENT_TIMESTAMP
WHERE plan_type = 'FreeTrial' AND is_active = true;

-- Verify the updates
SELECT 
  plan_type, 
  duration_days, 
  talk_time_minutes, 
  features 
FROM subscription_plans 
WHERE is_active = true
ORDER BY plan_type;
