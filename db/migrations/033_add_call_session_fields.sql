-- Migration 033: Add call session tracking fields to daily_progress
-- Similar to speaking session fields (practice), add dedicated call session tracking

-- Add call session fields
ALTER TABLE daily_progress 
ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS call_ended_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS call_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS call_duration_seconds INT DEFAULT 0;

-- Create index for call session queries
CREATE INDEX IF NOT EXISTS idx_daily_progress_call_completed 
ON daily_progress(user_id, progress_date, call_completed);

-- Comment for clarity
COMMENT ON COLUMN daily_progress.call_started_at IS 'When user started call session';
COMMENT ON COLUMN daily_progress.call_ended_at IS 'When user ended call session';
COMMENT ON COLUMN daily_progress.call_completed IS 'Whether call session was completed';
COMMENT ON COLUMN daily_progress.call_duration_seconds IS 'Total duration of call session in seconds';
