-- Migration 049: Remove exam/practice extra fields from daily_progress
-- Context: Exam-specific data now lives in WEEKLY_EXAMS, and practice is unified into speaking_*.

BEGIN;

ALTER TABLE daily_progress
  DROP COLUMN IF EXISTS practice_duration_seconds,
  DROP COLUMN IF EXISTS practice_remaining_seconds,
  DROP COLUMN IF EXISTS exam_completed,
  DROP COLUMN IF EXISTS exam_started_at,
  DROP COLUMN IF EXISTS exam_ended_at,
  DROP COLUMN IF EXISTS exam_duration_seconds,
  DROP COLUMN IF EXISTS exam_score;

COMMIT;

