-- Create discount_tokens table
CREATE TABLE IF NOT EXISTS discount_tokens (
    id SERIAL PRIMARY KEY,
    token_code VARCHAR(255) UNIQUE NOT NULL,
    discount_percent DECIMAL(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    plan_type VARCHAR(20) NULL, -- NULL = applies to all plans, specific value = that plan only
    expires_at TIMESTAMP NULL,
    max_uses INTEGER NULL CHECK (max_uses IS NULL OR max_uses > 0),
    max_users INTEGER NULL CHECK (max_users IS NULL OR max_users > 0),
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Create discount_token_usage table
CREATE TABLE IF NOT EXISTS discount_token_usage (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    subscription_id INTEGER NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    original_amount DECIMAL(10,2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (token_id) REFERENCES discount_tokens(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    UNIQUE(token_id, user_id) -- Prevent same user from using same token twice
);

-- Create indices for discount_tokens
CREATE INDEX IF NOT EXISTS idx_discount_tokens_token_code ON discount_tokens(token_code);
CREATE INDEX IF NOT EXISTS idx_discount_tokens_plan_type ON discount_tokens(plan_type);
CREATE INDEX IF NOT EXISTS idx_discount_tokens_is_active ON discount_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_discount_tokens_expires_at ON discount_tokens(expires_at);

-- Create indices for discount_token_usage
CREATE INDEX IF NOT EXISTS idx_discount_token_usage_token_id ON discount_token_usage(token_id);
CREATE INDEX IF NOT EXISTS idx_discount_token_usage_user_id ON discount_token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_discount_token_usage_subscription_id ON discount_token_usage(subscription_id);

-- Add updated_at trigger for discount_tokens
CREATE OR REPLACE FUNCTION update_discount_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_discount_tokens_updated_at
    BEFORE UPDATE ON discount_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_discount_tokens_updated_at();
