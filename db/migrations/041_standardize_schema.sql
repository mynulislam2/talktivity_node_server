-- Migration 041: Standardize schema naming and defaults
-- Ensures consistent patterns across all tables

BEGIN;

-- Standardize timestamp defaults to CURRENT_TIMESTAMP
-- Update all created_at columns
DO $$
DECLARE
    table_rec RECORD;
    col_name TEXT;
BEGIN
    FOR table_rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP
        -- Update created_at
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = table_rec.table_name
            AND column_name = 'created_at'
            AND column_default IS NULL
        ) THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP', table_rec.table_name);
            RAISE NOTICE 'Updated created_at default for %', table_rec.table_name;
        END IF;
        
        -- Update updated_at
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = table_rec.table_name
            AND column_name = 'updated_at'
            AND column_default IS NULL
        ) THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP', table_rec.table_name);
            RAISE NOTICE 'Updated updated_at default for %', table_rec.table_name;
        END IF;
    END LOOP;
END $$;

-- Ensure all tables with updated_at have it set to CURRENT_TIMESTAMP on creation
-- (Triggers will handle updates, this is just for initial insert)

-- Standardize timestamp column types (ensure they're TIMESTAMP WITHOUT TIME ZONE)
-- This is informational - we'll keep existing types but ensure defaults are consistent

-- Add created_at and updated_at to tables that might be missing them
DO $$
BEGIN
    -- Call sessions
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'call_sessions' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE call_sessions ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'call_sessions' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE call_sessions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Conversations
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE conversations ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE conversations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- User lifecycle
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_lifecycle' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE user_lifecycle ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_lifecycle' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE user_lifecycle ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    RAISE NOTICE 'Verified/added created_at and updated_at columns';
END $$;

-- Standardize boolean column defaults (already done in migration 039, but ensure consistency)
-- This is a verification step

-- Ensure numeric defaults are consistent (0 for durations, counts, etc.)
DO $$
BEGIN
    -- Daily progress numeric defaults
    ALTER TABLE daily_progress
    ALTER COLUMN speaking_duration_seconds SET DEFAULT 0,
    ALTER COLUMN roleplay_duration_seconds SET DEFAULT 0,
    ALTER COLUMN total_time_seconds SET DEFAULT 0;
    
    -- Call sessions numeric defaults
    ALTER TABLE call_sessions
    ALTER COLUMN call_duration_seconds SET DEFAULT 0;
    
    -- Speaking sessions numeric defaults
    ALTER TABLE speaking_sessions
    ALTER COLUMN duration_seconds SET DEFAULT 0;
    
    -- Weekly exams numeric defaults (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_exams') THEN
        ALTER TABLE weekly_exams
        ALTER COLUMN exam_duration_seconds SET DEFAULT 0;
    END IF;
    
    -- Lifetime call usage (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lifetime_call_usage') THEN
        ALTER TABLE lifetime_call_usage
        ALTER COLUMN duration_seconds SET DEFAULT 0;
    END IF;
    
    RAISE NOTICE 'Standardized numeric defaults';
END $$;

-- Ensure NOT NULL constraints on critical columns
DO $$
BEGIN
    -- Users table
    ALTER TABLE users
    ALTER COLUMN email SET NOT NULL,
    ALTER COLUMN auth_provider SET NOT NULL;
    
    -- Daily progress
    ALTER TABLE daily_progress
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN course_id SET NOT NULL,
    ALTER COLUMN progress_date SET NOT NULL;
    
    -- Call sessions
    ALTER TABLE call_sessions
    ALTER COLUMN user_id SET NOT NULL;
    
    -- Subscriptions
    ALTER TABLE subscriptions
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN plan_id SET NOT NULL,
    ALTER COLUMN status SET NOT NULL;
    
    -- Payment transactions
    ALTER TABLE payment_transactions
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN transaction_id SET NOT NULL,
    ALTER COLUMN order_id SET NOT NULL,
    ALTER COLUMN amount SET NOT NULL,
    ALTER COLUMN status SET NOT NULL;
    
    RAISE NOTICE 'Applied NOT NULL constraints to critical columns';
END $$;

COMMIT;
