-- Migration: Drop unused fields from user_lifecycle table
-- Date: 2026-01-23
-- Description: Remove lifetime_call_seconds, lifetime_call_cap_seconds, and onboarding_test_call_used
--              These fields are no longer needed as we track call time via daily_usage table

-- Drop the three columns
ALTER TABLE user_lifecycle 
  DROP COLUMN IF EXISTS lifetime_call_seconds,
  DROP COLUMN IF EXISTS lifetime_call_cap_seconds,
  DROP COLUMN IF EXISTS onboarding_test_call_used;

-- Verify columns are dropped
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_lifecycle'
ORDER BY ordinal_position;
