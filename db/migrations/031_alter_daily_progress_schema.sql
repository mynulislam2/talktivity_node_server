-- 031_alter_daily_progress_schema.sql
-- Reshape daily_progress to new spec
-- - progress_date column replaces date
-- - speaking_{started,ended}_at rename
-- - speaking_quiz_* replaces quiz_* (drop attempts)
-- - listening_quiz_* keeps score/completed, drop attempts
-- - add roleplay_started_at / roleplay_ended_at
-- - drop listening start/end timestamps
-- - enforce UNIQUE (user_id, course_id, progress_date)
-- - FK course_id -> user_courses(id)

BEGIN;

-- Rename date column to progress_date
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='date') THEN
    ALTER TABLE daily_progress RENAME COLUMN date TO progress_date;
  END IF;
END $$;

-- Rename speaking start/end to started_at/ended_at
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='speaking_start_time') THEN
    ALTER TABLE daily_progress RENAME COLUMN speaking_start_time TO speaking_started_at;
  END IF;
END $$;

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='speaking_end_time') THEN
    ALTER TABLE daily_progress RENAME COLUMN speaking_end_time TO speaking_ended_at;
  END IF;
END $$;

-- Add roleplay start/end if missing
ALTER TABLE daily_progress
  ADD COLUMN IF NOT EXISTS roleplay_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS roleplay_ended_at TIMESTAMP;

-- Rename quiz -> speaking_quiz
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='quiz_completed') THEN
    ALTER TABLE daily_progress RENAME COLUMN quiz_completed TO speaking_quiz_completed;
  END IF;
END $$;

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='quiz_score') THEN
    ALTER TABLE daily_progress RENAME COLUMN quiz_score TO speaking_quiz_score;
  END IF;
END $$;

-- Drop attempts columns
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='quiz_attempts') THEN
    ALTER TABLE daily_progress DROP COLUMN quiz_attempts;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='listening_quiz_attempts') THEN
    ALTER TABLE daily_progress DROP COLUMN listening_quiz_attempts;
  END IF;
END $$;

-- Drop listening start/end timestamps (not in new spec)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='listening_start_time') THEN
    ALTER TABLE daily_progress DROP COLUMN listening_start_time;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='listening_end_time') THEN
    ALTER TABLE daily_progress DROP COLUMN listening_end_time;
  END IF;
END $$;

-- Ensure required columns exist with defaults (only current schema fields)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='speaking_completed') THEN
    ALTER TABLE daily_progress ALTER COLUMN speaking_completed SET DEFAULT FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='speaking_duration_seconds') THEN
    ALTER TABLE daily_progress ALTER COLUMN speaking_duration_seconds SET DEFAULT 0;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='listening_completed') THEN
    ALTER TABLE daily_progress ALTER COLUMN listening_completed SET DEFAULT FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='listening_quiz_completed') THEN
    ALTER TABLE daily_progress ALTER COLUMN listening_quiz_completed SET DEFAULT FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='roleplay_completed') THEN
    ALTER TABLE daily_progress ALTER COLUMN roleplay_completed SET DEFAULT FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='total_time_seconds') THEN
    ALTER TABLE daily_progress ALTER COLUMN total_time_seconds SET DEFAULT 0;
  END IF;
  -- Not-null constraints
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='progress_date') THEN
    ALTER TABLE daily_progress ALTER COLUMN progress_date SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='course_id') THEN
    ALTER TABLE daily_progress ALTER COLUMN course_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='daily_progress' AND column_name='user_id') THEN
    ALTER TABLE daily_progress ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- Ensure columns exist for speaking/listening quiz scores and roleplay times
ALTER TABLE daily_progress
  ADD COLUMN IF NOT EXISTS speaking_quiz_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS speaking_quiz_score INTEGER,
  ADD COLUMN IF NOT EXISTS listening_quiz_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS listening_quiz_score INTEGER,
  ADD COLUMN IF NOT EXISTS total_time_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speaking_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS listening_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS roleplay_completed BOOLEAN DEFAULT FALSE;

-- Add roleplay duration defaults if missing
ALTER TABLE daily_progress
  ALTER COLUMN roleplay_duration_seconds SET DEFAULT 0;

-- Drop old FK and add new FK to user_courses
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'daily_progress'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%course%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE daily_progress DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE daily_progress
  ADD CONSTRAINT fk_daily_progress_course_user_course
  FOREIGN KEY (course_id) REFERENCES user_courses(id) ON DELETE CASCADE;

-- Ensure user FK exists
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'daily_progress'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%user%';

  IF fk_name IS NULL THEN
    ALTER TABLE daily_progress
      ADD CONSTRAINT fk_daily_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Unique constraint on user/course/day
ALTER TABLE daily_progress
  DROP CONSTRAINT IF EXISTS uq_user_course_day;

ALTER TABLE daily_progress
  ADD CONSTRAINT uq_user_course_day UNIQUE (user_id, course_id, progress_date);

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date ON daily_progress(user_id, progress_date);

COMMIT;
