ALTER TABLE groups
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE; 