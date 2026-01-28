-- 048_add_course_id_to_vocabulary_completions.sql
-- Purpose: Connect vocabulary completions directly to user courses
-- This ensures vocabulary progress is tied to specific course instances

BEGIN;

-- Drop existing unique constraint (if it exists)
ALTER TABLE vocabulary_completions
DROP CONSTRAINT IF EXISTS vocabulary_completions_user_id_week_number_day_number_completed_date_key;

-- Add course_id column to vocabulary_completions
ALTER TABLE vocabulary_completions
ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES user_courses(id) ON DELETE CASCADE;

-- Create index for course_id lookups
CREATE INDEX IF NOT EXISTS idx_vocabulary_completions_course_id 
  ON vocabulary_completions(course_id);

-- Update existing records to link to active courses
UPDATE vocabulary_completions vc
SET course_id = uc.id
FROM user_courses uc
WHERE uc.user_id = vc.user_id 
  AND uc.is_active = true
  AND vc.course_id IS NULL;

-- Add new unique constraint including course_id
-- Allows same user to complete same week/day in different courses
ALTER TABLE vocabulary_completions
ADD CONSTRAINT uq_vocabulary_completions_user_course_week_day_date 
UNIQUE (user_id, course_id, week_number, day_number, completed_date);

COMMIT;
