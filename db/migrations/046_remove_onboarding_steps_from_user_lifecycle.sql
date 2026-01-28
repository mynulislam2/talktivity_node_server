-- 046_remove_onboarding_steps_from_user_lifecycle.sql
-- Purpose: Remove onboarding_steps column from user_lifecycle table
-- onboarding_data table is the single source of truth for onboarding data
-- No need to duplicate this data in user_lifecycle

BEGIN;

-- Drop the onboarding_steps column from user_lifecycle
ALTER TABLE user_lifecycle
DROP COLUMN IF EXISTS onboarding_steps;

COMMIT;
