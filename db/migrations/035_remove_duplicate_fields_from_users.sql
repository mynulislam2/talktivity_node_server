-- Migration 035: Remove duplicate fields from users table
-- Migrate data from users to user_lifecycle, then remove duplicate columns
-- Fields: call_completed, onboarding_completed, report_completed, onboarding_test_call_used

BEGIN;

-- Step 1: Ensure user_lifecycle records exist for all users
-- Check if columns exist in users table before trying to use them
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed') THEN
        INSERT INTO user_lifecycle (user_id, onboarding_completed, call_completed, report_completed, created_at, updated_at)
        SELECT 
            u.id,
            COALESCE(ul.onboarding_completed, u.onboarding_completed, false),
            COALESCE(ul.call_completed, u.call_completed, false),
            COALESCE(ul.report_completed, u.report_completed, false),
            COALESCE(ul.created_at, u.created_at, CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM users u
        LEFT JOIN user_lifecycle ul ON u.id = ul.user_id
        WHERE ul.user_id IS NULL
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        -- Columns already removed, just ensure user_lifecycle records exist
        INSERT INTO user_lifecycle (user_id, onboarding_completed, call_completed, report_completed, created_at, updated_at)
        SELECT 
            u.id,
            COALESCE(ul.onboarding_completed, false),
            COALESCE(ul.call_completed, false),
            COALESCE(ul.report_completed, false),
            COALESCE(ul.created_at, u.created_at, CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM users u
        LEFT JOIN user_lifecycle ul ON u.id = ul.user_id
        WHERE ul.user_id IS NULL
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;

-- Step 2: Update existing user_lifecycle records with data from users (if columns exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed') THEN
        UPDATE user_lifecycle ul
        SET 
            onboarding_completed = COALESCE(ul.onboarding_completed, u.onboarding_completed, false),
            call_completed = COALESCE(ul.call_completed, u.call_completed, false),
            report_completed = COALESCE(ul.report_completed, u.report_completed, false),
            updated_at = CURRENT_TIMESTAMP
        FROM users u
        WHERE ul.user_id = u.id
          AND (
            (ul.onboarding_completed IS NULL OR ul.onboarding_completed = false) AND u.onboarding_completed = true
            OR (ul.call_completed IS NULL OR ul.call_completed = false) AND u.call_completed = true
            OR (ul.report_completed IS NULL OR ul.report_completed = false) AND u.report_completed = true
          );
    END IF;
END $$;

-- Step 3: Add onboarding_test_call_used to user_lifecycle if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_lifecycle' 
        AND column_name = 'onboarding_test_call_used'
    ) THEN
        ALTER TABLE user_lifecycle 
        ADD COLUMN onboarding_test_call_used BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Step 4: Migrate onboarding_test_call_used from users to user_lifecycle (if column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_test_call_used') THEN
        UPDATE user_lifecycle ul
        SET onboarding_test_call_used = COALESCE(ul.onboarding_test_call_used, u.onboarding_test_call_used, false)
        FROM users u
        WHERE ul.user_id = u.id
          AND u.onboarding_test_call_used = true
          AND (ul.onboarding_test_call_used IS NULL OR ul.onboarding_test_call_used = false);
    END IF;
END $$;

-- Step 5: Remove duplicate columns from users table
DO $$
BEGIN
    -- Remove call_completed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'call_completed'
    ) THEN
        ALTER TABLE users DROP COLUMN call_completed;
        RAISE NOTICE 'Dropped call_completed from users table';
    END IF;
    
    -- Remove onboarding_completed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'onboarding_completed'
    ) THEN
        ALTER TABLE users DROP COLUMN onboarding_completed;
        RAISE NOTICE 'Dropped onboarding_completed from users table';
    END IF;
    
    -- Remove report_completed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'report_completed'
    ) THEN
        ALTER TABLE users DROP COLUMN report_completed;
        RAISE NOTICE 'Dropped report_completed from users table';
    END IF;
    
    -- Remove onboarding_test_call_used
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'onboarding_test_call_used'
    ) THEN
        ALTER TABLE users DROP COLUMN onboarding_test_call_used;
        RAISE NOTICE 'Dropped onboarding_test_call_used from users table';
    END IF;
END $$;

COMMIT;
