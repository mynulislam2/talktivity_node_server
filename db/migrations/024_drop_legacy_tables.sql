-- 024_drop_legacy_tables.sql
-- Purpose: Drop duplicate and legacy tables after successful user_lifecycle migration
-- Safe: Tables are only dropped after backfill confirmed all data migrated
-- These tables are no longer used by the application

BEGIN;

-- Drop legacy duplicate/unused tables
-- Order matters: drop dependent tables first (those with FKs), then parent tables

DROP TABLE IF EXISTS device_speaking_sessions CASCADE;
DROP TABLE IF EXISTS lifetime_call_usage CASCADE;
DROP TABLE IF EXISTS device_conversations CASCADE;
DROP TABLE IF EXISTS user_daily_usage CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;

COMMIT;
