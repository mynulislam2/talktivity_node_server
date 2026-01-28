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
      // Create user
      const user = await client.query(
        `INSERT INTO users (email, password, full_name, auth_provider, is_email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, 'local', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, email, full_name, created_at`,
        [email, password, fullName]
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
};

module.exports = authRepo;
