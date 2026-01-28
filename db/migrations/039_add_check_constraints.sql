-- Migration 039: Add check constraints for data validation
-- Ensures only valid data can be inserted into the database

BEGIN;

-- Call sessions: session_type validation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_call_sessions_session_type'
        AND table_name = 'call_sessions'
    ) THEN
        ALTER TABLE call_sessions
        ADD CONSTRAINT chk_call_sessions_session_type
        CHECK (session_type IN ('practice', 'roleplay', 'call'));
        
        RAISE NOTICE 'Added check constraint: chk_call_sessions_session_type';
    ELSE
        RAISE NOTICE 'Check constraint already exists: chk_call_sessions_session_type';
    END IF;
END $$;

-- Subscriptions: status validation
-- First, clean up invalid status values
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    -- Find and update invalid status values
    SELECT COUNT(*) INTO invalid_count
    FROM subscriptions
    WHERE status NOT IN ('pending', 'active', 'expired', 'cancelled');
    
    IF invalid_count > 0 THEN
        -- Update invalid statuses to 'expired' (safest default)
        UPDATE subscriptions
        SET status = 'expired'
        WHERE status NOT IN ('pending', 'active', 'expired', 'cancelled');
        
        RAISE NOTICE 'Updated % subscriptions with invalid status to expired', invalid_count;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_subscriptions_status'
        AND table_name = 'subscriptions'
    ) THEN
        ALTER TABLE subscriptions
        ADD CONSTRAINT chk_subscriptions_status
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled'));
        
        RAISE NOTICE 'Added check constraint: chk_subscriptions_status';
    ELSE
        RAISE NOTICE 'Check constraint already exists: chk_subscriptions_status';
    END IF;
END $$;

-- Users: auth_provider validation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_users_auth_provider'
        AND table_name = 'users'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT chk_users_auth_provider
        CHECK (auth_provider IN ('local', 'google', 'facebook'));
        
        RAISE NOTICE 'Added check constraint: chk_users_auth_provider';
    ELSE
        RAISE NOTICE 'Check constraint already exists: chk_users_auth_provider';
    END IF;
END $$;

-- Payment transactions: status validation
-- First, clean up invalid status values
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    -- Find and update invalid status values
    SELECT COUNT(*) INTO invalid_count
    FROM payment_transactions
    WHERE status NOT IN ('pending', 'completed', 'failed', 'refunded', 'cancelled');
    
    IF invalid_count > 0 THEN
        -- Update invalid statuses to 'failed' (safest default for payments)
        UPDATE payment_transactions
        SET status = 'failed'
        WHERE status NOT IN ('pending', 'completed', 'failed', 'refunded', 'cancelled');
        
        RAISE NOTICE 'Updated % payment_transactions with invalid status to failed', invalid_count;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_payment_transactions_status'
        AND table_name = 'payment_transactions'
    ) THEN
        ALTER TABLE payment_transactions
        ADD CONSTRAINT chk_payment_transactions_status
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled'));
        
        RAISE NOTICE 'Added check constraint: chk_payment_transactions_status';
    ELSE
        RAISE NOTICE 'Check constraint already exists: chk_payment_transactions_status';
    END IF;
END $$;

-- Ensure boolean fields have NOT NULL and DEFAULT values where appropriate
DO $$
BEGIN
    -- Daily progress boolean fields
    ALTER TABLE daily_progress
    ALTER COLUMN speaking_completed SET DEFAULT false,
    ALTER COLUMN speaking_quiz_completed SET DEFAULT false,
    ALTER COLUMN listening_completed SET DEFAULT false,
    ALTER COLUMN listening_quiz_completed SET DEFAULT false,
    ALTER COLUMN roleplay_completed SET DEFAULT false;
    
    -- Set NOT NULL if not already set
    ALTER TABLE daily_progress
    ALTER COLUMN speaking_completed SET NOT NULL,
    ALTER COLUMN speaking_quiz_completed SET NOT NULL,
    ALTER COLUMN listening_completed SET NOT NULL,
    ALTER COLUMN listening_quiz_completed SET NOT NULL,
    ALTER COLUMN roleplay_completed SET NOT NULL;
    
    RAISE NOTICE 'Updated boolean defaults and NOT NULL constraints for daily_progress';
END $$;

-- Call sessions boolean fields
DO $$
BEGIN
    ALTER TABLE call_sessions
    ALTER COLUMN call_completed SET DEFAULT false;
    
    -- Only set NOT NULL if column allows it (check first)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'call_sessions'
        AND column_name = 'call_completed'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE call_sessions
        ALTER COLUMN call_completed SET NOT NULL;
    END IF;
    
    RAISE NOTICE 'Updated boolean defaults for call_sessions';
END $$;

-- User lifecycle boolean fields
DO $$
BEGIN
    ALTER TABLE user_lifecycle
    ALTER COLUMN onboarding_completed SET DEFAULT false,
    ALTER COLUMN call_completed SET DEFAULT false,
    ALTER COLUMN report_completed SET DEFAULT false,
    ALTER COLUMN upgrade_completed SET DEFAULT false;
    
    ALTER TABLE user_lifecycle
    ALTER COLUMN onboarding_completed SET NOT NULL,
    ALTER COLUMN call_completed SET NOT NULL,
    ALTER COLUMN report_completed SET NOT NULL,
    ALTER COLUMN upgrade_completed SET NOT NULL;
    
    RAISE NOTICE 'Updated boolean defaults and NOT NULL constraints for user_lifecycle';
END $$;

-- Users boolean fields
DO $$
BEGIN
    ALTER TABLE users
    ALTER COLUMN is_email_verified SET DEFAULT false,
    ALTER COLUMN is_admin SET DEFAULT false;
    
    ALTER TABLE users
    ALTER COLUMN is_email_verified SET NOT NULL,
    ALTER COLUMN is_admin SET NOT NULL;
    
    RAISE NOTICE 'Updated boolean defaults and NOT NULL constraints for users';
END $$;

-- Weekly exams boolean fields
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_exams') THEN
        ALTER TABLE weekly_exams
        ALTER COLUMN exam_completed SET DEFAULT false;
        
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'weekly_exams'
            AND column_name = 'exam_completed'
            AND is_nullable = 'YES'
        ) THEN
            ALTER TABLE weekly_exams
            ALTER COLUMN exam_completed SET NOT NULL;
        END IF;
        
        RAISE NOTICE 'Updated boolean defaults for weekly_exams';
    END IF;
END $$;

-- Subscriptions boolean fields
DO $$
BEGIN
    ALTER TABLE subscriptions
    ALTER COLUMN is_free_trial SET DEFAULT false,
    ALTER COLUMN free_trial_used SET DEFAULT false;
    
    ALTER TABLE subscriptions
    ALTER COLUMN is_free_trial SET NOT NULL,
    ALTER COLUMN free_trial_used SET NOT NULL;
    
    RAISE NOTICE 'Updated boolean defaults and NOT NULL constraints for subscriptions';
END $$;

-- Groups boolean fields
DO $$
BEGIN
    ALTER TABLE groups
    ALTER COLUMN is_public SET DEFAULT true,
    ALTER COLUMN is_featured SET DEFAULT false,
    ALTER COLUMN is_trending SET DEFAULT false,
    ALTER COLUMN is_common SET DEFAULT false;
    
    ALTER TABLE groups
    ALTER COLUMN is_public SET NOT NULL,
    ALTER COLUMN is_featured SET NOT NULL,
    ALTER COLUMN is_trending SET NOT NULL,
    ALTER COLUMN is_common SET NOT NULL;
    
    RAISE NOTICE 'Updated boolean defaults and NOT NULL constraints for groups';
END $$;

-- DM messages and group messages boolean fields
DO $$
BEGIN
    ALTER TABLE dm_messages
    ALTER COLUMN read SET DEFAULT false,
    ALTER COLUMN pinned SET DEFAULT false;
    
    ALTER TABLE dm_messages
    ALTER COLUMN read SET NOT NULL,
    ALTER COLUMN pinned SET NOT NULL;
    
    ALTER TABLE group_messages
    ALTER COLUMN pinned SET DEFAULT false;
    
    ALTER TABLE group_messages
    ALTER COLUMN pinned SET NOT NULL;
    
    RAISE NOTICE 'Updated boolean defaults and NOT NULL constraints for messages';
END $$;

COMMIT;
