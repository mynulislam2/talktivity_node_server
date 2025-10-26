-- Migration 015: Create vocabulary completion tracking table
-- This table tracks when users complete their daily vocabulary words
-- to prevent them from seeing the same words again on the same day

CREATE TABLE IF NOT EXISTS vocabulary_completions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    week_number INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, week_number, day_number, completed_date)
);

-- Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_vocabulary_completions_user_id ON vocabulary_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_completions_date ON vocabulary_completions(completed_date);
CREATE INDEX IF NOT EXISTS idx_vocabulary_completions_week_day ON vocabulary_completions(week_number, day_number);