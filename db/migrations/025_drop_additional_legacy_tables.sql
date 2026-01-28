-- 025_drop_additional_legacy_tables.sql
-- Purpose: Remove remaining unused/duplicate tables for clean schema
-- Safe: Verified no active code references these tables

BEGIN;

-- Drop deprecated reporting & tracking tables
DROP TABLE IF EXISTS test_call_usage CASCADE;
DROP TABLE IF EXISTS call_reports CASCADE;
DROP TABLE IF EXISTS dm_participants CASCADE;
DROP TABLE IF EXISTS last_read_at CASCADE;

COMMIT;
