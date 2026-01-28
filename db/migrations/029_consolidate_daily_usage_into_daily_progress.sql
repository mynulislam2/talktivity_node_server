-- Migration 029: Consolidate daily_usage into daily_progress
-- Updated: daily_progress now uses progress_date and no longer stores exam columns

-- Step 1: Drop daily_usage table if it still exists
DROP TABLE IF EXISTS daily_usage CASCADE;

-- Step 2: Ensure index on daily_progress (user_id, progress_date)
CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date 
ON daily_progress(user_id, progress_date);

-- Step 3: Drop old daily_usage index if it exists (safety)
DROP INDEX IF EXISTS idx_daily_usage_user_date CASCADE;
