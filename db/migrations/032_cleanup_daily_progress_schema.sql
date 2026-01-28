-- Migration 032: Cleanup daily_progress schema
-- Remove fields not in the final schema design
-- Retains: id, user_id, course_id, week_number, day_number, progress_date,
--          speaking_* (4 cols), speaking_quiz_*, listening_completed, listening_quiz_*,
--          roleplay_* (4 cols), total_time_seconds, created_at, updated_at

BEGIN;

-- Drop exam-related columns
ALTER TABLE daily_progress DROP COLUMN IF EXISTS exam_completed;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS exam_score;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS exam_duration_seconds;

-- Drop listening duration (not in schema)
ALTER TABLE daily_progress DROP COLUMN IF EXISTS listening_duration_seconds;

-- Drop practice duration (replaced by speaking_started_at/ended_at)
ALTER TABLE daily_progress DROP COLUMN IF EXISTS practice_duration_seconds;

-- Drop legacy timestamp columns (replaced by started_at/ended_at)
ALTER TABLE daily_progress DROP COLUMN IF EXISTS listening_start_time;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS listening_end_time;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS speaking_start_time;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS speaking_end_time;

-- Drop legacy attempt columns
ALTER TABLE daily_progress DROP COLUMN IF EXISTS quiz_attempts;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS listening_quiz_attempts;

-- Drop legacy boolean/score columns (replaced by speaking_quiz_*)
ALTER TABLE daily_progress DROP COLUMN IF EXISTS quiz_completed;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS quiz_score;

-- Drop roleplay remaining (not needed, use started_at/ended_at)
ALTER TABLE daily_progress DROP COLUMN IF EXISTS roleplay_remaining_seconds;
ALTER TABLE daily_progress DROP COLUMN IF EXISTS practice_remaining_seconds;

-- Drop legacy date column (replaced by progress_date)
ALTER TABLE daily_progress DROP COLUMN IF EXISTS date;

COMMIT;
