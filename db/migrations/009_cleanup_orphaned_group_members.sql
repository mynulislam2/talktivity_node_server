-- 009_cleanup_orphaned_group_members.sql
-- Clean up orphaned group_members records that reference non-existent users
DELETE FROM group_members 
WHERE user_id NOT IN (SELECT id FROM users);

-- Add foreign key constraint to prevent future orphaned records
-- Note: This will fail if there are still orphaned records, so run the DELETE above first
ALTER TABLE group_members 
ADD CONSTRAINT fk_group_members_user_id 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Add index for better performance on member count queries
CREATE INDEX IF NOT EXISTS idx_group_members_group_user ON group_members(group_id, user_id);




