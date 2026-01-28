-- Migration 038: Add unique constraints to prevent duplicate records
-- Ensures data integrity and prevents duplicate entries

BEGIN;

-- Daily progress: unique per user, course, and date
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_daily_progress_user_course_date'
        AND table_name = 'daily_progress'
    ) THEN
        -- Drop existing constraint if it has different name
        ALTER TABLE daily_progress DROP CONSTRAINT IF EXISTS uq_user_course_day;
        
        ALTER TABLE daily_progress
        ADD CONSTRAINT uq_daily_progress_user_course_date 
        UNIQUE (user_id, course_id, progress_date);
        
        RAISE NOTICE 'Added unique constraint: uq_daily_progress_user_course_date';
    ELSE
        RAISE NOTICE 'Unique constraint already exists: uq_daily_progress_user_course_date';
    END IF;
END $$;

-- Onboarding data: one record per user
-- First, remove duplicates (keep the most recent one)
DO $$
BEGIN
    -- Delete duplicate onboarding_data records, keeping the one with the highest id
    DELETE FROM onboarding_data od1
    WHERE EXISTS (
        SELECT 1 FROM onboarding_data od2
        WHERE od2.user_id = od1.user_id
        AND od2.id > od1.id
    );
    
    RAISE NOTICE 'Cleaned up duplicate onboarding_data records';
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_onboarding_data_user_id'
        AND table_name = 'onboarding_data'
    ) THEN
        ALTER TABLE onboarding_data
        ADD CONSTRAINT uq_onboarding_data_user_id 
        UNIQUE (user_id);
        
        RAISE NOTICE 'Added unique constraint: uq_onboarding_data_user_id';
    ELSE
        RAISE NOTICE 'Unique constraint already exists: uq_onboarding_data_user_id';
    END IF;
END $$;

-- User lifecycle: already has PRIMARY KEY on user_id, verify it exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_lifecycle_pkey'
        AND table_name = 'user_lifecycle'
        AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE user_lifecycle
        ADD PRIMARY KEY (user_id);
        
        RAISE NOTICE 'Added primary key: user_lifecycle_pkey';
    ELSE
        RAISE NOTICE 'Primary key already exists: user_lifecycle_pkey';
    END IF;
END $$;

-- DMs: ensure unique pairs (user1_id, user2_id) regardless of order
-- Use a functional unique constraint or check constraint
DO $$
BEGIN
    -- Create a unique index on the sorted pair
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'uq_dms_user_pair'
    ) THEN
        CREATE UNIQUE INDEX uq_dms_user_pair 
        ON dms (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));
        
        RAISE NOTICE 'Added unique index: uq_dms_user_pair';
    ELSE
        RAISE NOTICE 'Unique index already exists: uq_dms_user_pair';
    END IF;
END $$;

-- Users: email should be unique (verify)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'users_email_key'
        AND table_name = 'users'
    ) THEN
        -- Check if unique index exists instead
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE indexname = 'users_email_key' OR indexname = 'idx_users_email'
        ) THEN
            CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email);
            RAISE NOTICE 'Added unique index: users_email_key';
        END IF;
    ELSE
        RAISE NOTICE 'Unique constraint already exists on users.email';
    END IF;
END $$;

-- Vocabulary completions: unique per user, week, day
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_vocabulary_completions_user_week_day'
        AND table_name = 'vocabulary_completions'
    ) THEN
        ALTER TABLE vocabulary_completions
        ADD CONSTRAINT uq_vocabulary_completions_user_week_day
        UNIQUE (user_id, week_number, day_number);
        
        RAISE NOTICE 'Added unique constraint: uq_vocabulary_completions_user_week_day';
    ELSE
        RAISE NOTICE 'Unique constraint already exists: uq_vocabulary_completions_user_week_day';
    END IF;
END $$;

-- User word progress: unique per user and word
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_user_word_progress_user_word'
        AND table_name = 'user_word_progress'
    ) THEN
        ALTER TABLE user_word_progress
        ADD CONSTRAINT uq_user_word_progress_user_word
        UNIQUE (user_id, word_id);
        
        RAISE NOTICE 'Added unique constraint: uq_user_word_progress_user_word';
    ELSE
        RAISE NOTICE 'Unique constraint already exists: uq_user_word_progress_user_word';
    END IF;
END $$;

COMMIT;
