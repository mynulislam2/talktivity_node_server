-- 010_add_session_duration_to_conversations.sql
-- Add session_duration column to conversations table to track call duration

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS session_duration INTEGER DEFAULT NULL;

-- Add index for better performance on duration queries
CREATE INDEX IF NOT EXISTS idx_conversations_session_duration ON conversations(session_duration) WHERE session_duration IS NOT NULL;
