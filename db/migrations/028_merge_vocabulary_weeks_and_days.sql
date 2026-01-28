-- 028_merge_vocabulary_weeks_and_days.sql
-- Purpose: Consolidate vocabulary_weeks and vocabulary_days into single vocabulary_hierarchy table
-- Removes unnecessary join, simplifies queries

BEGIN;

-- Create merged vocabulary hierarchy table
CREATE TABLE IF NOT EXISTS vocabulary_hierarchy (
    id SERIAL PRIMARY KEY,
    week_number INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(week_number, day_number)
);

-- Backfill from vocabulary_weeks + vocabulary_days if they exist
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vocabulary_days') THEN
    INSERT INTO vocabulary_hierarchy (week_number, day_number, created_at, updated_at)
    SELECT DISTINCT vd.week_number, vd.day_number, vw.created_at, vw.updated_at
    FROM vocabulary_days vd
    JOIN vocabulary_weeks vw ON vd.week_id = vw.id
    ON CONFLICT (week_number, day_number) DO NOTHING;
  END IF;
END $$;

-- Update vocabulary_words to reference vocabulary_hierarchy if needed
-- (Keep week_number, day_number denormalized in vocabulary_words for query performance)

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_vocabulary_hierarchy_week_day 
  ON vocabulary_hierarchy(week_number, day_number);

-- Drop old tables
DROP TABLE IF EXISTS vocabulary_days CASCADE;
DROP TABLE IF EXISTS vocabulary_weeks CASCADE;

COMMIT;
