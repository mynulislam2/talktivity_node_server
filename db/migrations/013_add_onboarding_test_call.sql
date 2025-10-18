-- Add onboarding test call tracking to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_test_call_used BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_onboarding_test_call_used ON users(onboarding_test_call_used);
