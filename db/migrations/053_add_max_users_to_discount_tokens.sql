-- Add max_users column to discount_tokens table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'discount_tokens' AND column_name = 'max_users'
    ) THEN
        ALTER TABLE discount_tokens 
        ADD COLUMN max_users INTEGER NULL CHECK (max_users IS NULL OR max_users > 0);
    END IF;
END $$;
