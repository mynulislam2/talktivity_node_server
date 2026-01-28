-- 022_create_user_lifecycle_and_extend_daily_progress.sql
-- Purpose: Introduce user_lifecycle table and extend daily_progress with practice/roleplay/total fields

BEGIN;

-- Create user_lifecycle table (1:1 with users)
CREATE TABLE IF NOT EXISTS user_lifecycle (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_steps JSONB DEFAULT '[]',
  onboarding_test_call_used BOOLEAN DEFAULT false,
  call_completed BOOLEAN DEFAULT false,
  report_completed BOOLEAN DEFAULT false,
  upgrade_completed BOOLEAN DEFAULT false,
  lifetime_call_seconds INTEGER DEFAULT 0,
  lifetime_call_cap_seconds INTEGER DEFAULT 300,
  last_progress_check_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Helpful index for looking up active users by lifecycle checks
CREATE INDEX IF NOT EXISTS idx_user_lifecycle_user_id ON user_lifecycle(user_id);

-- Extend daily_progress: add practice/roleplay/total durations if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='daily_progress' AND column_name='practice_duration_seconds'
  ) THEN
    ALTER TABLE daily_progress ADD COLUMN practice_duration_seconds INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='daily_progress' AND column_name='roleplay_duration_seconds'
  ) THEN
    ALTER TABLE daily_progress ADD COLUMN roleplay_duration_seconds INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='daily_progress' AND column_name='total_time_seconds'
  ) THEN
    ALTER TABLE daily_progress ADD COLUMN total_time_seconds INTEGER DEFAULT 0;
  END IF;
END $$;

COMMIT;
