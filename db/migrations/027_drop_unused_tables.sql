-- 027_drop_unused_tables.sql
-- Purpose: Drop weekly_exams, user_devices, and merge vocabulary tables
-- Consolidates: weekly_exams → daily_usage, user_devices removed, vocabulary_weeks+days → vocabulary_hierarchy

BEGIN;

-- Drop weekly_exams (data migrated to daily_usage)
DROP TABLE IF EXISTS weekly_exams CASCADE;

-- Drop user_devices (not needed for current architecture)
DROP TABLE IF EXISTS user_devices CASCADE;

COMMIT;
