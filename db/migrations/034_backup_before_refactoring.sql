-- Migration 034: Backup before refactoring
-- Create backup tables for critical data before making schema changes
-- This allows rollback if needed

BEGIN;

-- Create backup timestamp suffix
DO $$
DECLARE
    backup_suffix TEXT;
    users_cols TEXT := 'id, email, created_at, updated_at';
BEGIN
    backup_suffix := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    
    -- Backup users table (focusing on fields we'll remove, if they exist)
    -- Build dynamic SELECT based on which columns exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'call_completed') THEN
        users_cols := users_cols || ', call_completed';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_completed') THEN
        users_cols := users_cols || ', onboarding_completed';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'report_completed') THEN
        users_cols := users_cols || ', report_completed';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'onboarding_test_call_used') THEN
        users_cols := users_cols || ', onboarding_test_call_used';
    END IF;
    
    EXECUTE format('CREATE TABLE IF NOT EXISTS users_backup_%s AS SELECT %s FROM users', backup_suffix, users_cols);
    
    -- Backup user_lifecycle table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS user_lifecycle_backup_%s AS
        SELECT * FROM user_lifecycle
    ', backup_suffix);
    
    -- Backup daily_progress table (focusing on call fields we'll remove, if they exist)
    -- Check if call fields exist before backing them up
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'daily_progress' 
        AND column_name IN ('call_started_at', 'call_ended_at', 'call_completed', 'call_duration_seconds')
    ) THEN
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS daily_progress_backup_%s AS
            SELECT 
                id,
                user_id,
                course_id,
                progress_date,
                call_started_at,
                call_ended_at,
                call_completed,
                call_duration_seconds,
                created_at,
                updated_at
            FROM daily_progress
            WHERE (call_started_at IS NOT NULL 
               OR call_ended_at IS NOT NULL 
               OR call_completed = true
               OR call_duration_seconds > 0)
        ', backup_suffix);
    ELSE
        -- If call fields don't exist, just backup the table structure
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS daily_progress_backup_%s AS
            SELECT 
                id,
                user_id,
                course_id,
                progress_date,
                created_at,
                updated_at
            FROM daily_progress
            LIMIT 0
        ', backup_suffix);
    END IF;
    
    RAISE NOTICE 'Backup tables created with suffix: %', backup_suffix;
END $$;

-- Verify backup tables were created
DO $$
DECLARE
    backup_count INTEGER;
    backup_suffix TEXT;
BEGIN
    backup_suffix := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    
    SELECT COUNT(*) INTO backup_count
    FROM information_schema.tables
    WHERE table_name IN (
        'users_backup_' || backup_suffix,
        'user_lifecycle_backup_' || backup_suffix,
        'daily_progress_backup_' || backup_suffix
    );
    
    IF backup_count < 3 THEN
        RAISE EXCEPTION 'Failed to create all backup tables. Only % created.', backup_count;
    END IF;
    
    RAISE NOTICE 'Successfully created % backup tables', backup_count;
END $$;

COMMIT;
