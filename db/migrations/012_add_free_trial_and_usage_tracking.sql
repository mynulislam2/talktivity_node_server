-- Add free trial fields to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_free_trial BOOLEAN DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS free_trial_started_at TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS free_trial_used BOOLEAN DEFAULT false;

-- Create table for tracking daily usage
CREATE TABLE IF NOT EXISTS daily_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    usage_date DATE NOT NULL,
    call_time_seconds INTEGER DEFAULT 0,
    practice_time_seconds INTEGER DEFAULT 0,
    roleplay_time_seconds INTEGER DEFAULT 0,
    total_time_seconds INTEGER DEFAULT 0,
    scenarios_created INTEGER DEFAULT 0,
    roleplay_sessions_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, usage_date)
);

-- Create table for tracking roleplay sessions by section
CREATE TABLE IF NOT EXISTS roleplay_section_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    section_name VARCHAR(100) NOT NULL,
    sessions_completed INTEGER DEFAULT 0,
    usage_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, section_name, usage_date)
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_roleplay_section_usage_user_section ON roleplay_section_usage(user_id, section_name);
CREATE INDEX IF NOT EXISTS idx_subscriptions_free_trial ON subscriptions(is_free_trial, free_trial_started_at);

-- Update subscription plans with proper limits
UPDATE subscription_plans SET 
    features = '["5min_daily_talk", "5_scenarios", "5_roleplay_per_section", "personalized_roadmap", "community_section", "free_trial_eligible"]'
WHERE plan_type = 'Basic';

UPDATE subscription_plans SET 
    features = '["unlimited_ai_conversations", "1hour_daily_talk", "unlimited_scenarios", "unlimited_roleplay", "advanced_analytics", "personalized_roadmap", "community_section"]'
WHERE plan_type = 'Pro';

-- Add free trial plan
INSERT INTO subscription_plans (name, plan_type, price, duration_days, talk_time_minutes, max_scenarios, features) VALUES
('Free Trial', 'FreeTrial', 0.00, 7, 5, 5, '["5min_daily_talk", "5_scenarios", "5_roleplay_per_section", "personalized_roadmap", "community_section", "free_trial"]')
ON CONFLICT (name) DO NOTHING;
