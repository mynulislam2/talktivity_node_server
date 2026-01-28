-- 023_adjust_daily_progress_drop_call_fields.sql
-- Purpose: Ensure daily_progress has no legacy call-related fields
-- Safe no-op drops using IF EXISTS to avoid errors on environments

BEGIN;

ALTER TABLE IF EXISTS daily_progress
  DROP COLUMN IF EXISTS call_time_seconds,
  DROP COLUMN IF EXISTS call_completed,
  DROP COLUMN IF EXISTS call_start_time,
  DROP COLUMN IF EXISTS call_end_time;

COMMIT;
