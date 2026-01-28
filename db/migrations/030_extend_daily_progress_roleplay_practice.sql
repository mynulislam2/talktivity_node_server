-- Migration: Extend daily_progress with roleplay/practice remaining seconds
-- Adds remaining-time fields to daily_progress and drops legacy usage tables if present

DROP TABLE IF EXISTS roleplay_section_usage;
DROP TABLE IF EXISTS daily_usage;

ALTER TABLE daily_progress
  ADD COLUMN IF NOT EXISTS roleplay_remaining_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS practice_remaining_seconds integer DEFAULT 0;
