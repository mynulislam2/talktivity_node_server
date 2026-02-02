-- Migration 050: Create per-user roleplay_sessions table and remove legacy roleplay/custom categories

BEGIN;

-- Create roleplay_sessions table (per-user)
CREATE TABLE IF NOT EXISTS roleplay_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  first_prompt TEXT NOT NULL,
  my_role VARCHAR(255) NOT NULL,
  other_role VARCHAR(255) NOT NULL,
  situation TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_roleplay_sessions_user_id ON roleplay_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_sessions_created_at ON roleplay_sessions(created_at);

-- Ensure updated_at trigger exists for this new table (042 creates the function and triggers for existing tables only)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_roleplay_sessions_updated_at ON roleplay_sessions';
    EXECUTE 'CREATE TRIGGER trg_roleplay_sessions_updated_at
             BEFORE UPDATE ON roleplay_sessions
             FOR EACH ROW
             EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END $$;

-- Remove legacy categories that used to hold roleplay + user-created topics
-- These were previously global and/or mixed across users in JSONB arrays.
DELETE FROM topic_categories
WHERE category_name IN ('Role Play Scenarios', 'Custom Category');

COMMIT;

