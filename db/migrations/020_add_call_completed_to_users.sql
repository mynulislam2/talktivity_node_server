-- Add call completion tracking to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS call_completed BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_call_completed ON users(call_completed);
