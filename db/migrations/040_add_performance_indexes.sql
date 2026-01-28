-- Migration 040: Add performance indexes
-- Improves query performance on frequently accessed columns

BEGIN;

-- Helper function to create index only if table exists
CREATE OR REPLACE FUNCTION create_index_if_table_exists(
    p_index_name TEXT,
    p_table_name TEXT,
    p_index_definition TEXT
) RETURNS VOID AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = p_table_name) THEN
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I %s', p_index_name, p_table_name, p_index_definition);
        RAISE NOTICE 'Created index: %', p_index_name;
    ELSE
        RAISE NOTICE 'Table % does not exist, skipping index: %', p_table_name, p_index_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Indexes on foreign key columns (for JOIN performance)
SELECT create_index_if_table_exists('idx_call_sessions_user_id', 'call_sessions', '(user_id)');
SELECT create_index_if_table_exists('idx_conversations_user_id', 'conversations', '(user_id)');
SELECT create_index_if_table_exists('idx_daily_progress_user_id', 'daily_progress', '(user_id)');
SELECT create_index_if_table_exists('idx_daily_progress_course_id', 'daily_progress', '(course_id)');
SELECT create_index_if_table_exists('idx_onboarding_data_user_id', 'onboarding_data', '(user_id)');
SELECT create_index_if_table_exists('idx_subscriptions_user_id', 'subscriptions', '(user_id)');
SELECT create_index_if_table_exists('idx_subscriptions_plan_id', 'subscriptions', '(plan_id)');
SELECT create_index_if_table_exists('idx_payment_transactions_user_id', 'payment_transactions', '(user_id)');
SELECT create_index_if_table_exists('idx_payment_transactions_subscription_id', 'payment_transactions', '(subscription_id)');
SELECT create_index_if_table_exists('idx_user_courses_user_id', 'user_courses', '(user_id)');
SELECT create_index_if_table_exists('idx_speaking_sessions_user_id', 'speaking_sessions', '(user_id)');
SELECT create_index_if_table_exists('idx_speaking_sessions_course_id', 'speaking_sessions', '(course_id)');
-- Weekly exams indexes (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_exams') THEN
        CREATE INDEX IF NOT EXISTS idx_weekly_exams_user_id ON weekly_exams(user_id);
        CREATE INDEX IF NOT EXISTS idx_weekly_exams_course_id ON weekly_exams(course_id);
        CREATE INDEX IF NOT EXISTS idx_weekly_exams_exam_date ON weekly_exams(exam_date);
        CREATE INDEX IF NOT EXISTS idx_weekly_exams_user_week ON weekly_exams(user_id, week_number);
        CREATE INDEX IF NOT EXISTS idx_weekly_exams_user_completed ON weekly_exams(user_id, exam_completed);
    END IF;
END $$;

SELECT create_index_if_table_exists('idx_daily_reports_user_id', 'daily_reports', '(user_id)');
SELECT create_index_if_table_exists('idx_user_oauth_providers_user_id', 'user_oauth_providers', '(user_id)');
SELECT create_index_if_table_exists('idx_user_sessions_user_id', 'user_sessions', '(user_id)');
SELECT create_index_if_table_exists('idx_user_word_progress_user_id', 'user_word_progress', '(user_id)');
SELECT create_index_if_table_exists('idx_user_word_progress_word_id', 'user_word_progress', '(word_id)');
SELECT create_index_if_table_exists('idx_vocabulary_completions_user_id', 'vocabulary_completions', '(user_id)');
SELECT create_index_if_table_exists('idx_vocabulary_words_day_id', 'vocabulary_words', '(day_id)');
SELECT create_index_if_table_exists('idx_groups_created_by', 'groups', '(created_by)');
SELECT create_index_if_table_exists('idx_group_members_group_id', 'group_members', '(group_id)');
SELECT create_index_if_table_exists('idx_group_members_user_id', 'group_members', '(user_id)');
SELECT create_index_if_table_exists('idx_group_messages_group_id', 'group_messages', '(group_id)');
SELECT create_index_if_table_exists('idx_group_messages_user_id', 'group_messages', '(user_id)');
SELECT create_index_if_table_exists('idx_dms_user1_id', 'dms', '(user1_id)');
SELECT create_index_if_table_exists('idx_dms_user2_id', 'dms', '(user2_id)');
SELECT create_index_if_table_exists('idx_dm_messages_dm_id', 'dm_messages', '(dm_id)');
SELECT create_index_if_table_exists('idx_dm_messages_sender_id', 'dm_messages', '(sender_id)');
SELECT create_index_if_table_exists('idx_last_read_at_user_id', 'last_read_at', '(user_id)');
SELECT create_index_if_table_exists('idx_last_read_at_group_id', 'last_read_at', '(group_id)');
SELECT create_index_if_table_exists('idx_last_read_at_dm_id', 'last_read_at', '(dm_id)');
SELECT create_index_if_table_exists('idx_muted_groups_user_id', 'muted_groups', '(user_id)');
SELECT create_index_if_table_exists('idx_muted_groups_group_id', 'muted_groups', '(group_id)');
SELECT create_index_if_table_exists('idx_lifetime_call_usage_user_id', 'lifetime_call_usage', '(user_id)');

-- Indexes on date/timestamp columns (for time-based queries)
SELECT create_index_if_table_exists('idx_daily_progress_progress_date', 'daily_progress', '(progress_date)');
SELECT create_index_if_table_exists('idx_daily_progress_user_date', 'daily_progress', '(user_id, progress_date)');
SELECT create_index_if_table_exists('idx_call_sessions_call_started_at', 'call_sessions', '(call_started_at)');
SELECT create_index_if_table_exists('idx_call_sessions_user_started', 'call_sessions', '(user_id, call_started_at)');
SELECT create_index_if_table_exists('idx_conversations_timestamp', 'conversations', '(timestamp)');
SELECT create_index_if_table_exists('idx_conversations_user_timestamp', 'conversations', '(user_id, timestamp)');
SELECT create_index_if_table_exists('idx_daily_reports_report_date', 'daily_reports', '(report_date)');
SELECT create_index_if_table_exists('idx_daily_reports_user_date', 'daily_reports', '(user_id, report_date)');
SELECT create_index_if_table_exists('idx_speaking_sessions_date', 'speaking_sessions', '(date)');
SELECT create_index_if_table_exists('idx_speaking_sessions_user_date', 'speaking_sessions', '(user_id, date)');
SELECT create_index_if_table_exists('idx_user_courses_start_date', 'user_courses', '(course_start_date)');
SELECT create_index_if_table_exists('idx_user_courses_end_date', 'user_courses', '(course_end_date)');
SELECT create_index_if_table_exists('idx_subscriptions_start_date', 'subscriptions', '(start_date)');
SELECT create_index_if_table_exists('idx_subscriptions_end_date', 'subscriptions', '(end_date)');
SELECT create_index_if_table_exists('idx_payment_transactions_created_at', 'payment_transactions', '(created_at)');
SELECT create_index_if_table_exists('idx_users_created_at', 'users', '(created_at)');
SELECT create_index_if_table_exists('idx_user_lifecycle_updated_at', 'user_lifecycle', '(updated_at)');

-- Composite indexes for common query patterns
SELECT create_index_if_table_exists('idx_daily_progress_user_course_date', 'daily_progress', '(user_id, course_id, progress_date)');
SELECT create_index_if_table_exists('idx_subscriptions_user_status', 'subscriptions', '(user_id, status)');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
        CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active ON subscriptions(user_id, status) WHERE status = 'active';
    END IF;
END $$;
SELECT create_index_if_table_exists('idx_call_sessions_user_completed', 'call_sessions', '(user_id, call_completed)');
SELECT create_index_if_table_exists('idx_vocabulary_completions_user_week', 'vocabulary_completions', '(user_id, week_number)');
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_courses') THEN
        CREATE INDEX IF NOT EXISTS idx_user_courses_user_active ON user_courses(user_id, is_active) WHERE is_active = true;
    END IF;
END $$;

-- Indexes on frequently filtered columns
SELECT create_index_if_table_exists('idx_user_courses_is_active', 'user_courses', '(is_active)');
SELECT create_index_if_table_exists('idx_subscriptions_status', 'subscriptions', '(status)');
SELECT create_index_if_table_exists('idx_groups_is_public', 'groups', '(is_public)');
SELECT create_index_if_table_exists('idx_groups_is_featured', 'groups', '(is_featured)');
SELECT create_index_if_table_exists('idx_subscription_plans_is_active', 'subscription_plans', '(is_active)');

-- Indexes for text search (if needed)
-- Note: Full-text search indexes would require additional setup
SELECT create_index_if_table_exists('idx_conversations_room_name', 'conversations', '(room_name)');
SELECT create_index_if_table_exists('idx_groups_name', 'groups', '(name)');

-- Clean up helper function
DROP FUNCTION IF EXISTS create_index_if_table_exists(TEXT, TEXT, TEXT);

COMMIT;
