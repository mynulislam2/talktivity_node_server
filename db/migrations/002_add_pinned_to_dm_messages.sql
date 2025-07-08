-- 002_add_pinned_to_dm_messages.sql
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE; 