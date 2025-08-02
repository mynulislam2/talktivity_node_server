-- Migration: Create daily_reports table
-- This table stores cached daily reports to avoid regenerating them multiple times per day

CREATE TABLE IF NOT EXISTS daily_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    report_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one report per user per day
    UNIQUE(user_id, report_date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date);

-- Create index for date-based queries
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date); 