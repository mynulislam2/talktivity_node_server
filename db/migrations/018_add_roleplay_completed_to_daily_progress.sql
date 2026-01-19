-- Add roleplay_completed flag to daily_progress for roleplay timeline status
ALTER TABLE daily_progress
    ADD COLUMN IF NOT EXISTS roleplay_completed BOOLEAN DEFAULT false;

