-- Migration 042: Add updated_at triggers
-- Automatically updates updated_at timestamp when rows are modified

BEGIN;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables with updated_at column
DO $$
DECLARE
    table_rec RECORD;
    trigger_name TEXT;
BEGIN
    FOR table_rec IN 
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND column_name = 'updated_at'
        AND table_name NOT IN (
            -- Exclude system tables
            'pg_stat_statements'
        )
    LOOP
        trigger_name := 'trg_' || table_rec.table_name || '_updated_at';
        
        -- Drop existing trigger if it exists
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, table_rec.table_name);
        
        -- Create new trigger
        EXECUTE format('
            CREATE TRIGGER %I
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        ', trigger_name, table_rec.table_name);
        
        RAISE NOTICE 'Created trigger % for table %', trigger_name, table_rec.table_name;
    END LOOP;
END $$;

-- Verify triggers were created
DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.tgname LIKE 'trg_%_updated_at'
    AND t.tgenabled = 'O'; -- 'O' means enabled
    
    RAISE NOTICE 'Created % updated_at triggers', trigger_count;
END $$;

COMMIT;
