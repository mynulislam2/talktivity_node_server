-- 045_change_onboarding_steps_to_integer.sql
-- Purpose: Change onboarding_steps from jsonb to integer (count 0-15)
-- The onboarding_data table stores the full onboarding data as jsonb
-- user_lifecycle.onboarding_steps should only store the count

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_lifecycle'
      AND column_name = 'onboarding_steps'
  ) THEN
    -- Convert existing jsonb-like values to integer
    EXECUTE $mig$
      UPDATE user_lifecycle
      SET onboarding_steps = CASE
        WHEN onboarding_steps::text ~ '^[0-9]+$' THEN (onboarding_steps::text)::integer
        WHEN onboarding_steps::text = '[]' THEN 0
        ELSE 0
      END
      WHERE onboarding_steps IS NOT NULL
    $mig$;

    -- Change column type from jsonb to integer (no-op if already integer-compatible)
    EXECUTE $mig$
      ALTER TABLE user_lifecycle
      ALTER COLUMN onboarding_steps TYPE integer USING (
        CASE
          WHEN onboarding_steps::text ~ '^[0-9]+$' THEN (onboarding_steps::text)::integer
          WHEN onboarding_steps::text = '[]' THEN 0
          ELSE 0
        END
      )
    $mig$;

    -- Set default to 0 (integer)
    EXECUTE $mig$
      ALTER TABLE user_lifecycle
      ALTER COLUMN onboarding_steps SET DEFAULT 0
    $mig$;
  END IF;
END $$;

COMMIT;
