-- 026_consolidate_daily_usage_with_exams.sql
-- Purpose: Add exam tracking (score, completed) to daily_usage table
-- Removes need for separate weekly_exams table

BEGIN;

-- Add exam fields to daily_usage
ALTER TABLE daily_usage
  ADD COLUMN IF NOT EXISTS exam_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS exam_score INTEGER,
  ADD COLUMN IF NOT EXISTS exam_duration_seconds INTEGER DEFAULT 0;

-- Backfill existing exam data from weekly_exams if available
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_exams') THEN
    UPDATE daily_usage du
    SET exam_completed = we.exam_completed,
        exam_score = we.exam_score,
        exam_duration_seconds = we.exam_duration_seconds
    FROM weekly_exams we
    WHERE du.user_id = we.user_id
      AND du.usage_date = we.exam_date::date;
  END IF;
END $$;

COMMIT;
