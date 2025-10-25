-- Add report completion tracking to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS report_completed BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_report_completed ON users(report_completed);