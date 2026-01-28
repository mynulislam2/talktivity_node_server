-- Migration 043: Verify refactoring and run integrity checks
-- Validates that all constraints, indexes, and data integrity are in place

BEGIN;

-- Create a verification report
DO $$
DECLARE
    report_text TEXT := '';
    constraint_count INTEGER;
    index_count INTEGER;
    fk_count INTEGER;
    unique_count INTEGER;
    check_count INTEGER;
    orphan_count INTEGER;
BEGIN
    report_text := '=== DATABASE REFACTORING VERIFICATION REPORT ===' || E'\n' || E'\n';
    
    -- Count foreign key constraints
    SELECT COUNT(*) INTO fk_count
    FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
    AND table_schema = 'public';
    
    report_text := report_text || 'Foreign Key Constraints: ' || fk_count || E'\n';
    
    -- Count unique constraints (including primary keys)
    SELECT COUNT(*) INTO unique_count
    FROM information_schema.table_constraints
    WHERE constraint_type IN ('UNIQUE', 'PRIMARY KEY')
    AND table_schema = 'public';
    
    report_text := report_text || 'Unique Constraints (including PKs): ' || unique_count || E'\n';
    
    -- Count check constraints
    SELECT COUNT(*) INTO check_count
    FROM information_schema.table_constraints
    WHERE constraint_type = 'CHECK'
    AND table_schema = 'public';
    
    report_text := report_text || 'Check Constraints: ' || check_count || E'\n';
    
    -- Count indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname NOT LIKE 'pg_%';
    
    report_text := report_text || 'Indexes: ' || index_count || E'\n' || E'\n';
    
    -- Check for orphaned records
    -- Orphaned daily_progress records (user_id doesn't exist)
    SELECT COUNT(*) INTO orphan_count
    FROM daily_progress dp
    LEFT JOIN users u ON dp.user_id = u.id
    WHERE u.id IS NULL;
    
    IF orphan_count > 0 THEN
        report_text := report_text || 'WARNING: Found ' || orphan_count || ' orphaned daily_progress records' || E'\n';
    ELSE
        report_text := report_text || '✓ No orphaned daily_progress records' || E'\n';
    END IF;
    
    -- Orphaned call_sessions records
    SELECT COUNT(*) INTO orphan_count
    FROM call_sessions cs
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE u.id IS NULL;
    
    IF orphan_count > 0 THEN
        report_text := report_text || 'WARNING: Found ' || orphan_count || ' orphaned call_sessions records' || E'\n';
    ELSE
        report_text := report_text || '✓ No orphaned call_sessions records' || E'\n';
    END IF;
    
    -- Orphaned subscriptions records
    SELECT COUNT(*) INTO orphan_count
    FROM subscriptions s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE u.id IS NULL;
    
    IF orphan_count > 0 THEN
        report_text := report_text || 'WARNING: Found ' || orphan_count || ' orphaned subscriptions records' || E'\n';
    ELSE
        report_text := report_text || '✓ No orphaned subscriptions records' || E'\n';
    END IF;
    
    -- Verify critical constraints exist
    report_text := report_text || E'\n' || '=== CRITICAL CONSTRAINT VERIFICATION ===' || E'\n';
    
    -- Check daily_progress unique constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_daily_progress_user_course_date'
        AND table_name = 'daily_progress'
    ) THEN
        report_text := report_text || '✓ daily_progress unique constraint exists' || E'\n';
    ELSE
        report_text := report_text || '✗ MISSING: daily_progress unique constraint' || E'\n';
    END IF;
    
    -- Check onboarding_data unique constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_onboarding_data_user_id'
        AND table_name = 'onboarding_data'
    ) THEN
        report_text := report_text || '✓ onboarding_data unique constraint exists' || E'\n';
    ELSE
        report_text := report_text || '✗ MISSING: onboarding_data unique constraint' || E'\n';
    END IF;
    
    -- Check user_lifecycle primary key
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_lifecycle_pkey'
        AND table_name = 'user_lifecycle'
    ) THEN
        report_text := report_text || '✓ user_lifecycle primary key exists' || E'\n';
    ELSE
        report_text := report_text || '✗ MISSING: user_lifecycle primary key' || E'\n';
    END IF;
    
    -- Check call_sessions check constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_call_sessions_session_type'
        AND table_name = 'call_sessions'
    ) THEN
        report_text := report_text || '✓ call_sessions session_type check constraint exists' || E'\n';
    ELSE
        report_text := report_text || '✗ MISSING: call_sessions session_type check constraint' || E'\n';
    END IF;
    
    -- Check subscriptions status check constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chk_subscriptions_status'
        AND table_name = 'subscriptions'
    ) THEN
        report_text := report_text || '✓ subscriptions status check constraint exists' || E'\n';
    ELSE
        report_text := report_text || '✗ MISSING: subscriptions status check constraint' || E'\n';
    END IF;
    
    -- Verify triggers exist
    report_text := report_text || E'\n' || '=== TRIGGER VERIFICATION ===' || E'\n';
    
    DECLARE
        trigger_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO trigger_count
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
        AND t.tgname LIKE 'trg_%_updated_at'
        AND t.tgenabled = 'O';
        
        report_text := report_text || 'Updated_at triggers: ' || trigger_count || E'\n';
    END;
    
    -- Verify no call fields in daily_progress
    report_text := report_text || E'\n' || '=== SCHEMA VERIFICATION ===' || E'\n';
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'daily_progress'
        AND column_name IN ('call_started_at', 'call_ended_at', 'call_completed', 'call_duration_seconds')
    ) THEN
        report_text := report_text || '✓ Call fields removed from daily_progress' || E'\n';
    ELSE
        report_text := report_text || '✗ WARNING: Call fields still exist in daily_progress' || E'\n';
    END IF;
    
    -- Verify duplicate fields removed from users
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name IN ('call_completed', 'onboarding_completed', 'report_completed', 'onboarding_test_call_used')
    ) THEN
        report_text := report_text || '✓ Duplicate fields removed from users table' || E'\n';
    ELSE
        report_text := report_text || '✗ WARNING: Duplicate fields still exist in users table' || E'\n';
    END IF;
    
    -- Output the report
    RAISE NOTICE '%', report_text;
    
    -- Also create a table to store the report (optional)
    CREATE TABLE IF NOT EXISTS refactoring_verification_report (
        id SERIAL PRIMARY KEY,
        report_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        report_text TEXT
    );
    
    INSERT INTO refactoring_verification_report (report_text)
    VALUES (report_text);
    
END $$;

-- Final data integrity check
DO $$
DECLARE
    issue_count INTEGER := 0;
BEGIN
    -- Check for users without user_lifecycle records
    SELECT COUNT(*) INTO issue_count
    FROM users u
    LEFT JOIN user_lifecycle ul ON u.id = ul.user_id
    WHERE ul.user_id IS NULL;
    
    IF issue_count > 0 THEN
        RAISE WARNING 'Found % users without user_lifecycle records', issue_count;
    END IF;
    
    -- Check for invalid session_type values in call_sessions
    SELECT COUNT(*) INTO issue_count
    FROM call_sessions
    WHERE session_type NOT IN ('practice', 'roleplay', 'call')
    AND session_type IS NOT NULL;
    
    IF issue_count > 0 THEN
        RAISE WARNING 'Found % call_sessions with invalid session_type', issue_count;
    END IF;
    
    -- Check for invalid subscription status values
    SELECT COUNT(*) INTO issue_count
    FROM subscriptions
    WHERE status NOT IN ('pending', 'active', 'expired', 'cancelled');
    
    IF issue_count > 0 THEN
        RAISE WARNING 'Found % subscriptions with invalid status', issue_count;
    END IF;
    
    RAISE NOTICE 'Data integrity check completed';
END $$;

COMMIT;
