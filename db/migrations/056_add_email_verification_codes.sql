-- Migration: Add email verification and password reset code columns
-- Date: 2026-02-27

-- Add verification code columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expiry TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code_expiry TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Add indexes for faster lookup when verifying codes
CREATE INDEX IF NOT EXISTS idx_users_verification_code ON users(verification_code) WHERE verification_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_password_reset_code ON users(password_reset_code) WHERE password_reset_code IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN users.verification_code IS '6-digit OTP for email verification';
COMMENT ON COLUMN users.verification_code_expiry IS 'Expiry timestamp for verification code';
COMMENT ON COLUMN users.password_reset_code IS '6-digit OTP for password reset';
COMMENT ON COLUMN users.password_reset_code_expiry IS 'Expiry timestamp for password reset code';
COMMENT ON COLUMN users.email_verified_at IS 'Timestamp when email was verified';
