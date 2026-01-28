-- Migration 037: Add foreign key constraints for referential integrity
-- Ensures data consistency and prevents orphaned records

BEGIN;

-- Step 1: Clean up orphaned records before adding foreign keys
-- This prevents foreign key constraint violations
-- Only clean up tables that exist

DO $$
BEGIN
    -- Clean up orphaned group_messages
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_messages') THEN
        DELETE FROM group_messages 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned group_members
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_members') THEN
        DELETE FROM group_members 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned subscriptions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
        DELETE FROM subscriptions 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned payment_transactions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_transactions') THEN
        DELETE FROM payment_transactions 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned daily_progress
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_progress') THEN
        DELETE FROM daily_progress 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned call_sessions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'call_sessions') THEN
        DELETE FROM call_sessions 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned conversations
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
        DELETE FROM conversations 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned onboarding_data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_data') THEN
        DELETE FROM onboarding_data 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned user_courses
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_courses') THEN
        DELETE FROM user_courses 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned speaking_sessions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'speaking_sessions') THEN
        DELETE FROM speaking_sessions 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned daily_reports
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_reports') THEN
        DELETE FROM daily_reports 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned user_oauth_providers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_oauth_providers') THEN
        DELETE FROM user_oauth_providers 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned user_sessions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sessions') THEN
        DELETE FROM user_sessions 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned user_word_progress
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_word_progress') THEN
        DELETE FROM user_word_progress 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned vocabulary_completions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vocabulary_completions') THEN
        DELETE FROM vocabulary_completions 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned dms
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dms') THEN
        DELETE FROM dms 
        WHERE user1_id NOT IN (SELECT id FROM users)
           OR user2_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned dm_messages
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dm_messages') THEN
        DELETE FROM dm_messages 
        WHERE sender_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned last_read_at
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'last_read_at') THEN
        DELETE FROM last_read_at 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned muted_groups
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'muted_groups') THEN
        DELETE FROM muted_groups 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned lifetime_call_usage
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lifetime_call_usage') THEN
        DELETE FROM lifetime_call_usage 
        WHERE user_id NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned groups (created_by)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'groups') THEN
        UPDATE groups SET created_by = NULL 
        WHERE created_by NOT IN (SELECT id FROM users);
    END IF;

    -- Clean up orphaned group_messages (group_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_messages') THEN
        DELETE FROM group_messages 
        WHERE group_id IS NOT NULL 
          AND group_id NOT IN (SELECT id FROM groups);
    END IF;

    -- Clean up orphaned group_members (group_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'group_members') THEN
        DELETE FROM group_members 
        WHERE group_id IS NOT NULL 
          AND group_id NOT IN (SELECT id FROM groups);
    END IF;

    -- Clean up orphaned dm_messages (dm_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dm_messages') THEN
        DELETE FROM dm_messages 
        WHERE dm_id IS NOT NULL 
          AND dm_id NOT IN (SELECT id FROM dms);
    END IF;

    -- Clean up orphaned last_read_at (group_id, dm_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'last_read_at') THEN
        DELETE FROM last_read_at 
        WHERE (group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM groups))
           OR (dm_id IS NOT NULL AND dm_id NOT IN (SELECT id FROM dms));
    END IF;

    -- Clean up orphaned muted_groups (group_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'muted_groups') THEN
        DELETE FROM muted_groups 
        WHERE group_id IS NOT NULL 
          AND group_id NOT IN (SELECT id FROM groups);
    END IF;

    -- Clean up orphaned user_courses references
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_progress') THEN
        DELETE FROM daily_progress 
        WHERE course_id IS NOT NULL 
          AND course_id NOT IN (SELECT id FROM user_courses);
    END IF;

    -- Clean up orphaned speaking_sessions (course_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'speaking_sessions') THEN
        DELETE FROM speaking_sessions 
        WHERE course_id IS NOT NULL 
          AND course_id NOT IN (SELECT id FROM user_courses);
    END IF;

    -- Clean up orphaned subscriptions (plan_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
        DELETE FROM subscriptions 
        WHERE plan_id IS NOT NULL 
          AND plan_id NOT IN (SELECT id FROM subscription_plans);
    END IF;

    -- Clean up orphaned payment_transactions (subscription_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_transactions') THEN
        DELETE FROM payment_transactions 
        WHERE subscription_id IS NOT NULL 
          AND subscription_id NOT IN (SELECT id FROM subscriptions);
    END IF;

    -- Clean up orphaned user_word_progress (word_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_word_progress') THEN
        DELETE FROM user_word_progress 
        WHERE word_id IS NOT NULL 
          AND word_id NOT IN (SELECT id FROM vocabulary_words);
    END IF;

    -- Clean up orphaned vocabulary_words (day_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vocabulary_words') THEN
        DELETE FROM vocabulary_words 
        WHERE day_id IS NOT NULL 
          AND day_id NOT IN (SELECT id FROM vocabulary_hierarchy);
    END IF;
END $$;

-- Helper function to safely add foreign key if it doesn't exist
CREATE OR REPLACE FUNCTION add_foreign_key_if_not_exists(
    p_table_name TEXT,
    p_column_name TEXT,
    p_referenced_table TEXT,
    p_referenced_column TEXT,
    p_constraint_name TEXT,
    p_on_delete_action TEXT DEFAULT 'CASCADE'
) RETURNS VOID AS $$
DECLARE
    fk_exists BOOLEAN;
    table_exists BOOLEAN;
    ref_table_exists BOOLEAN;
BEGIN
    -- Check if source table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = p_table_name
    ) INTO table_exists;
    
    -- Check if referenced table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = p_referenced_table
    ) INTO ref_table_exists;
    
    IF NOT table_exists THEN
        RAISE NOTICE 'Table % does not exist, skipping foreign key: %', p_table_name, p_constraint_name;
        RETURN;
    END IF;
    
    IF NOT ref_table_exists THEN
        RAISE NOTICE 'Referenced table % does not exist, skipping foreign key: %', p_referenced_table, p_constraint_name;
        RETURN;
    END IF;
    
    -- Check if foreign key already exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.constraint_name = p_constraint_name
        AND tc.table_schema = 'public'
        AND tc.table_name = p_table_name
    ) INTO fk_exists;
    
    IF NOT fk_exists THEN
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE %s',
            p_table_name,
            p_constraint_name,
            p_column_name,
            p_referenced_table,
            p_referenced_column,
            p_on_delete_action
        );
        RAISE NOTICE 'Added foreign key: %', p_constraint_name;
    ELSE
        RAISE NOTICE 'Foreign key already exists: %', p_constraint_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Call sessions
SELECT add_foreign_key_if_not_exists('call_sessions', 'user_id', 'users', 'id', 'fk_call_sessions_user_id');

-- Conversations
SELECT add_foreign_key_if_not_exists('conversations', 'user_id', 'users', 'id', 'fk_conversations_user_id');

-- Daily progress (verify if already exists from migration 031)
SELECT add_foreign_key_if_not_exists('daily_progress', 'user_id', 'users', 'id', 'fk_daily_progress_user_id');
SELECT add_foreign_key_if_not_exists('daily_progress', 'course_id', 'user_courses', 'id', 'fk_daily_progress_course_id');

-- Onboarding data
SELECT add_foreign_key_if_not_exists('onboarding_data', 'user_id', 'users', 'id', 'fk_onboarding_data_user_id');

-- User lifecycle (should be PRIMARY KEY, but verify FK exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_lifecycle_pkey'
        AND table_name = 'user_lifecycle'
    ) THEN
        -- If no primary key, add one
        ALTER TABLE user_lifecycle ADD PRIMARY KEY (user_id);
    END IF;
    
    -- Ensure FK to users exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_user_lifecycle_user_id'
        AND table_name = 'user_lifecycle'
    ) THEN
        ALTER TABLE user_lifecycle 
        ADD CONSTRAINT fk_user_lifecycle_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Subscriptions
SELECT add_foreign_key_if_not_exists('subscriptions', 'user_id', 'users', 'id', 'fk_subscriptions_user_id');
SELECT add_foreign_key_if_not_exists('subscriptions', 'plan_id', 'subscription_plans', 'id', 'fk_subscriptions_plan_id');

-- Payment transactions
SELECT add_foreign_key_if_not_exists('payment_transactions', 'user_id', 'users', 'id', 'fk_payment_transactions_user_id');
SELECT add_foreign_key_if_not_exists('payment_transactions', 'subscription_id', 'subscriptions', 'id', 'fk_payment_transactions_subscription_id');

-- User courses (verify if already exists)
SELECT add_foreign_key_if_not_exists('user_courses', 'user_id', 'users', 'id', 'fk_user_courses_user_id');

-- Speaking sessions
SELECT add_foreign_key_if_not_exists('speaking_sessions', 'user_id', 'users', 'id', 'fk_speaking_sessions_user_id');
SELECT add_foreign_key_if_not_exists('speaking_sessions', 'course_id', 'user_courses', 'id', 'fk_speaking_sessions_course_id');

-- Weekly exams
SELECT add_foreign_key_if_not_exists('weekly_exams', 'user_id', 'users', 'id', 'fk_weekly_exams_user_id');
SELECT add_foreign_key_if_not_exists('weekly_exams', 'course_id', 'user_courses', 'id', 'fk_weekly_exams_course_id');

-- Daily reports
SELECT add_foreign_key_if_not_exists('daily_reports', 'user_id', 'users', 'id', 'fk_daily_reports_user_id');

-- User OAuth providers
SELECT add_foreign_key_if_not_exists('user_oauth_providers', 'user_id', 'users', 'id', 'fk_user_oauth_providers_user_id');

-- User sessions
SELECT add_foreign_key_if_not_exists('user_sessions', 'user_id', 'users', 'id', 'fk_user_sessions_user_id');

-- User word progress
SELECT add_foreign_key_if_not_exists('user_word_progress', 'user_id', 'users', 'id', 'fk_user_word_progress_user_id');
SELECT add_foreign_key_if_not_exists('user_word_progress', 'word_id', 'vocabulary_words', 'id', 'fk_user_word_progress_word_id');

-- Vocabulary completions
SELECT add_foreign_key_if_not_exists('vocabulary_completions', 'user_id', 'users', 'id', 'fk_vocabulary_completions_user_id');

-- Vocabulary words
SELECT add_foreign_key_if_not_exists('vocabulary_words', 'day_id', 'vocabulary_hierarchy', 'id', 'fk_vocabulary_words_day_id');

-- Groups
SELECT add_foreign_key_if_not_exists('groups', 'created_by', 'users', 'id', 'fk_groups_created_by');

-- Group members
SELECT add_foreign_key_if_not_exists('group_members', 'group_id', 'groups', 'id', 'fk_group_members_group_id');
SELECT add_foreign_key_if_not_exists('group_members', 'user_id', 'users', 'id', 'fk_group_members_user_id');

-- Group messages
SELECT add_foreign_key_if_not_exists('group_messages', 'group_id', 'groups', 'id', 'fk_group_messages_group_id');
SELECT add_foreign_key_if_not_exists('group_messages', 'user_id', 'users', 'id', 'fk_group_messages_user_id');

-- DMs
SELECT add_foreign_key_if_not_exists('dms', 'user1_id', 'users', 'id', 'fk_dms_user1_id');
SELECT add_foreign_key_if_not_exists('dms', 'user2_id', 'users', 'id', 'fk_dms_user2_id');

-- DM messages
SELECT add_foreign_key_if_not_exists('dm_messages', 'dm_id', 'dms', 'id', 'fk_dm_messages_dm_id');
SELECT add_foreign_key_if_not_exists('dm_messages', 'sender_id', 'users', 'id', 'fk_dm_messages_sender_id');

-- Last read at
SELECT add_foreign_key_if_not_exists('last_read_at', 'user_id', 'users', 'id', 'fk_last_read_at_user_id');
SELECT add_foreign_key_if_not_exists('last_read_at', 'group_id', 'groups', 'id', 'fk_last_read_at_group_id');
SELECT add_foreign_key_if_not_exists('last_read_at', 'dm_id', 'dms', 'id', 'fk_last_read_at_dm_id');

-- Muted groups
SELECT add_foreign_key_if_not_exists('muted_groups', 'user_id', 'users', 'id', 'fk_muted_groups_user_id');
SELECT add_foreign_key_if_not_exists('muted_groups', 'group_id', 'groups', 'id', 'fk_muted_groups_group_id');

-- Lifetime call usage
SELECT add_foreign_key_if_not_exists('lifetime_call_usage', 'user_id', 'users', 'id', 'fk_lifetime_call_usage_user_id');

-- Clean up helper function
DROP FUNCTION IF EXISTS add_foreign_key_if_not_exists(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

COMMIT;
