-- 047_remove_unused_onboarding_fields.sql
-- Purpose: Remove unused legacy columns from onboarding_data table
-- These fields are not part of the current 15-field onboarding flow
-- Fields being removed:
--   - english_usage
--   - improvement_areas
--   - speaking_obstacles
--   - learning_challenges
--   - hardest_part
--   - work_scenarios
--   - upcoming_occasions
--   - last_speaking_date

BEGIN;

-- Drop unused columns if they exist
ALTER TABLE onboarding_data
DROP COLUMN IF EXISTS english_usage,
DROP COLUMN IF EXISTS improvement_areas,
DROP COLUMN IF EXISTS speaking_obstacles,
DROP COLUMN IF EXISTS learning_challenges,
DROP COLUMN IF EXISTS hardest_part,
DROP COLUMN IF EXISTS work_scenarios,
DROP COLUMN IF EXISTS upcoming_occasions,
DROP COLUMN IF EXISTS last_speaking_date;

COMMIT;
