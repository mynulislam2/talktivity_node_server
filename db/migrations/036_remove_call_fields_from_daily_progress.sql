-- Migration 036: Remove call fields from daily_progress table
-- Call sessions are tracked in call_sessions table, not daily_progress
-- Remove: call_started_at, call_ended_at, call_completed, call_duration_seconds

BEGIN;

-- Step 1: Verify no active call data in daily_progress that needs migration
-- (This is informational - call data should already be in call_sessions)
-- Only check if call fields exist
DO $$
DECLARE
    call_record_count INTEGER := 0;
    has_call_fields BOOLEAN := false;
BEGIN
    -- Check if call fields exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'daily_progress'
        AND column_name IN ('call_started_at', 'call_ended_at', 'call_completed', 'call_duration_seconds')
    ) INTO has_call_fields;
    
    IF has_call_fields THEN
        SELECT COUNT(*) INTO call_record_count
        FROM daily_progress
        WHERE call_started_at IS NOT NULL 
           OR call_ended_at IS NOT NULL 
           OR call_completed = true
           OR call_duration_seconds > 0;
        
        IF call_record_count > 0 THEN
            RAISE NOTICE 'Found % daily_progress records with call data. Ensure this data is in call_sessions table.', call_record_count;
        ELSE
            RAISE NOTICE 'No call data found in daily_progress. Safe to remove call fields.';
        END IF;
    ELSE
        RAISE NOTICE 'Call fields already removed from daily_progress.';
    END IF;
END $$;

-- Step 2: Drop call-related columns from daily_progress
DO $$
BEGIN
    -- Drop call_started_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'daily_progress' AND column_name = 'call_started_at'
    ) THEN
        ALTER TABLE daily_progress DROP COLUMN call_started_at;
        RAISE NOTICE 'Dropped call_started_at from daily_progress table';
    END IF;
    
    -- Drop call_ended_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'daily_progress' AND column_name = 'call_ended_at'
    ) THEN
        ALTER TABLE daily_progress DROP COLUMN call_ended_at;
        RAISE NOTICE 'Dropped call_ended_at from daily_progress table';
    END IF;
    
    -- Drop call_completed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'daily_progress' AND column_name = 'call_completed'
    ) THEN
        ALTER TABLE daily_progress DROP COLUMN call_completed;
        RAISE NOTICE 'Dropped call_completed from daily_progress table';
    END IF;
    
    -- Drop call_duration_seconds
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'daily_progress' AND column_name = 'call_duration_seconds'
    ) THEN
        ALTER TABLE daily_progress DROP COLUMN call_duration_seconds;
        RAISE NOTICE 'Dropped call_duration_seconds from daily_progress table';
    END IF;
END $$;

-- Step 3: Drop any indexes related to call fields
DROP INDEX IF EXISTS idx_daily_progress_call_completed;

COMMIT;
