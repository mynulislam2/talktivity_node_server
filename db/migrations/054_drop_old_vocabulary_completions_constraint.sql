-- 054_drop_old_vocabulary_completions_constraint.sql
-- Purpose: Drop the old unique constraint that conflicts with the new course-based constraint
-- The old constraint uq_vocabulary_completions_user_week_day only checks (user_id, week_number, day_number)
-- The new constraint uq_vocabulary_completions_user_course_week_day_date includes course_id and completed_date
-- This allows users to complete the same week/day in different courses and on different dates

BEGIN;

-- Drop the old constraint that doesn't include course_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_vocabulary_completions_user_week_day'
        AND table_name = 'vocabulary_completions'
    ) THEN
        ALTER TABLE vocabulary_completions
        DROP CONSTRAINT uq_vocabulary_completions_user_week_day;
        
        RAISE NOTICE 'Dropped old constraint: uq_vocabulary_completions_user_week_day';
    ELSE
        RAISE NOTICE 'Old constraint does not exist: uq_vocabulary_completions_user_week_day';
    END IF;
END $$;

COMMIT;
