-- Track lifetime call usage (5-minute lifetime cap for all users)
CREATE TABLE IF NOT EXISTS lifetime_call_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lifetime_call_usage_user ON lifetime_call_usage(user_id);

