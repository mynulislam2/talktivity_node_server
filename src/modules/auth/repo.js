/**
 * Auth Module Repository
 * Database queries for users and sessions
 */

const db = require('../../core/db/client');

const authRepo = {
  async getUserByEmail(email) {
    return await db.queryOne(
      `SELECT id, email, password, full_name, created_at FROM users WHERE email = $1`,
      [email]
    );
  },

  async getUserById(userId) {
    return await db.queryOne(
      `SELECT u.id, u.email, u.full_name, u.profile_picture, u.created_at,
              ul.onboarding_completed, ul.call_completed, ul.report_completed, ul.upgrade_completed
       FROM users u
       LEFT JOIN user_lifecycle ul ON u.id = ul.user_id
       WHERE u.id = $1`,
      [userId]
    );
  },

  async createUser({ email, password, fullName }) {
    return await db.transaction(async (client) => {
      // Create user (fullName can be null, will be collected during onboarding)
      const user = await client.query(
        `INSERT INTO users (email, password, full_name, auth_provider, is_email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, 'local', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, email, full_name, created_at`,
        [email, password, fullName || null]
      );

      // Initialize user_lifecycle
      // onboarding_data table is the single source of truth for onboarding data
      // No need to store onboarding_steps in user_lifecycle
      await client.query(
        `INSERT INTO user_lifecycle (
          user_id, 
          onboarding_completed, 
          call_completed,
          report_completed,
          upgrade_completed,
          created_at,
          updated_at
        ) VALUES ($1, false, false, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [user.rows[0].id]
      );

      return user.rows[0];
    });
  },

  async createSession(userId, token) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    return await db.queryOne(
      `INSERT INTO user_sessions (user_id, session_token, expires_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id, user_id, expires_at`,
      [userId, token, expiresAt]
    );
  },

  async getSession(token) {
    return await db.queryOne(
      `SELECT id, user_id, expires_at FROM user_sessions 
       WHERE session_token = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [token]
    );
  },

  // ==========================================
  // Password Reset Methods
  // ==========================================

  async getUserByEmailWithResetCode(email) {
    return await db.queryOne(
      `SELECT id, email, full_name, password_reset_code, password_reset_code_expiry 
       FROM users WHERE email = $1`,
      [email]
    );
  },

  async setPasswordResetCode(userId, code, expiryTime) {
    return await db.query(
      `UPDATE users SET password_reset_code = $1, password_reset_code_expiry = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [code, expiryTime, userId]
    );
  },

  async clearPasswordResetCode(userId) {
    return await db.query(
      `UPDATE users SET password_reset_code = NULL, password_reset_code_expiry = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [userId]
    );
  },

  async updatePassword(userId, hashedPassword) {
    return await db.query(
      `UPDATE users SET password = $1, password_reset_code = NULL, password_reset_code_expiry = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [hashedPassword, userId]
    );
  },

  // ==========================================
  // Email Verification Methods
  // ==========================================

  async getUserByIdWithVerification(userId) {
    return await db.queryOne(
      `SELECT id, email, full_name, verification_code, verification_code_expiry, email_verified_at 
       FROM users WHERE id = $1`,
      [userId]
    );
  },

  async setVerificationCode(userId, code, expiryTime) {
    return await db.query(
      `UPDATE users SET verification_code = $1, verification_code_expiry = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [code, expiryTime, userId]
    );
  },

  async markEmailVerified(userId) {
    return await db.query(
      `UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, verification_code = NULL, verification_code_expiry = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [userId]
    );
  },
};

module.exports = authRepo;
