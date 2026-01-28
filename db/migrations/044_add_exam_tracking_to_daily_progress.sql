-- Migration 044: Add exam tracking fields to daily_progress table
-- Adds exam-related tracking similar to speaking, listening, and roleplay tracking

BEGIN;

-- Add exam tracking columns to daily_progress
ALTER TABLE daily_progress
  ADD COLUMN IF NOT EXISTS exam_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exam_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exam_ended_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exam_duration_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exam_score INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN daily_progress.exam_completed IS 'Whether the exam was completed';
COMMENT ON COLUMN daily_progress.exam_started_at IS 'When the exam was started';
COMMENT ON COLUMN daily_progress.exam_ended_at IS 'When the exam was ended';
COMMENT ON COLUMN daily_progress.exam_duration_seconds IS 'Total duration of exam in seconds';
COMMENT ON COLUMN daily_progress.exam_score IS 'Score achieved in the exam';

-- Create index for exam queries
CREATE INDEX IF NOT EXISTS idx_daily_progress_exam_completed ON daily_progress(user_id, progress_date, exam_completed);

COMMIT;
