-- Remove duplicate groups script
-- This script will remove duplicate groups, keeping only the first occurrence of each group name

-- First, let's see what duplicates we have
SELECT name, COUNT(*) as count, array_agg(id ORDER BY id) as ids
FROM groups 
GROUP BY name 
HAVING COUNT(*) > 1
ORDER BY name;

-- Remove duplicate groups, keeping only the first one (lowest ID) for each name
DELETE FROM groups 
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) as rn
        FROM groups
    ) t
    WHERE t.rn > 1
);

-- Verify the cleanup - this should return no rows if cleanup was successful
SELECT name, COUNT(*) as count
FROM groups 
GROUP BY name 
HAVING COUNT(*) > 1;

-- Show final groups list
SELECT id, name, description, category, created_at
FROM groups 
ORDER BY name, id; 