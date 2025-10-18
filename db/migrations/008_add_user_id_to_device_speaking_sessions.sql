-- Migration: Add user_id column to device_speaking_sessions table
-- This allows the table to be used for both device-based and user-based speaking sessions

-- Add user_id column (nullable to maintain backward compatibility)
ALTER TABLE device_speaking_sessions 
ADD COLUMN IF NOT EXISTS user_id INTEGER NULL;

-- Add foreign key constraint (check if constraint doesn't exist first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_device_speaking_sessions_user_id'
    ) THEN
        ALTER TABLE device_speaking_sessions 
        ADD CONSTRAINT fk_device_speaking_sessions_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create index for user_id queries
CREATE INDEX IF NOT EXISTS idx_device_speaking_sessions_user_id ON device_speaking_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_speaking_sessions_user_date ON device_speaking_sessions(user_id, date);
