-- Migration: Make device_id nullable on device_speaking_sessions
-- We now track sessions primarily by user_id, so device_id should not be required.

ALTER TABLE device_speaking_sessions
ALTER COLUMN device_id DROP NOT NULL;


