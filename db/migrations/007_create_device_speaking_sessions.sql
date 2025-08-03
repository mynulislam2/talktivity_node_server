-- Migration: Create device_speaking_sessions table
-- This table tracks speaking sessions for unauthenticated users (device-based)

CREATE TABLE IF NOT EXISTS device_speaking_sessions (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NULL,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_device_speaking_sessions_device_id ON device_speaking_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_speaking_sessions_date ON device_speaking_sessions(date);
CREATE INDEX IF NOT EXISTS idx_device_speaking_sessions_device_date ON device_speaking_sessions(device_id, date);
CREATE INDEX IF NOT EXISTS idx_device_speaking_sessions_active ON device_speaking_sessions(device_id, date) WHERE end_time IS NULL; 