/**
 * Admin Module Service
 * Implements admin queries for users, stats, and deletion.
 */

const db = require('../../core/db/client');

const adminService = {
  async getUsers({ search, page = 1, limit = 20, usedDiscountToken }) {
    const offset = (page - 1) * limit;

    let searchCondition = '';
    const queryParams = [];
    let paramIndex = 1;

    if (search) {
      searchCondition = `AND (u.email ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex} OR u.id::text ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Filter for users who used discount tokens
    let discountTokenCondition = '';
    if (usedDiscountToken === true) {
      discountTokenCondition = `AND EXISTS (
        SELECT 1 FROM discount_token_usage dtu 
        WHERE dtu.user_id = u.id
      )`;
    } else if (usedDiscountToken === false) {
      discountTokenCondition = `AND NOT EXISTS (
        SELECT 1 FROM discount_token_usage dtu 
        WHERE dtu.user_id = u.id
      )`;
    }

    const usersQuery = `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.created_at,
        u.google_id,
        u.profile_picture,
        COALESCE(speaking_stats.speaking_sessions_count, 0) as completed_calls,
        COALESCE(speaking_stats.speaking_duration, 0) as total_conversation_duration,
        COALESCE(last_activity.last_activity, u.created_at) as last_activity,
        CASE 
          WHEN has_onboarding.has_onboarding = true AND speaking_stats.user_id IS NOT NULL THEN 'Both'
          WHEN has_onboarding.has_onboarding = true THEN 'Onboarded'
          WHEN speaking_stats.user_id IS NOT NULL THEN 'Active'
          ELSE 'Registered'
        END as status,
        COALESCE(discount_users.used_discount_token, false) as used_discount_token
      FROM users u
      LEFT JOIN (
        SELECT 
          user_id,
          COUNT(*) as speaking_sessions_count,
          COALESCE(SUM(duration_seconds), 0) as speaking_duration
        FROM speaking_sessions
        WHERE duration_seconds > 0
        GROUP BY user_id
      ) speaking_stats ON u.id = speaking_stats.user_id
      LEFT JOIN (
        SELECT user_id, MAX(timestamp) as last_activity
        FROM conversations
        GROUP BY user_id
      ) last_activity ON u.id = last_activity.user_id
      LEFT JOIN (
        SELECT user_id, true as has_onboarding
        FROM onboarding_data
        GROUP BY user_id
      ) has_onboarding ON u.id = has_onboarding.user_id
      LEFT JOIN (
        SELECT DISTINCT user_id, true as used_discount_token
        FROM discount_token_usage
      ) discount_users ON u.id = discount_users.user_id
      WHERE 1=1 ${searchCondition} ${discountTokenCondition}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const users = await db.queryAll(usersQuery, [...queryParams, limit, offset]);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      WHERE 1=1 ${searchCondition} ${discountTokenCondition}
    `;
    const countResult = await db.queryOne(countQuery, queryParams);
    const total = parseInt(countResult?.total || 0);

    return {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },

  async deleteUser(userIdentifier) {
    return await db.transaction(async (client) => {
      // Try to find user by id
      let userCheck = await client.query(
        'SELECT id, email FROM users WHERE id = $1',
        [userIdentifier]
      );
      // If not found by id, try by email
      if (userCheck.rows.length === 0) {
        userCheck = await client.query(
          'SELECT id, email FROM users WHERE email = $1',
          [userIdentifier]
        );
      }

      if (userCheck.rows.length === 0) {
        return { found: false };
      }

      const userId = userCheck.rows[0].id;
      const userEmail = userCheck.rows[0].email;

      // Group chat and messaging data
      await client.query('DELETE FROM dm_messages WHERE sender_id = $1', [userId]);
      // DMs where this user is a participant will be removed by ON DELETE CASCADE
      // when the user is deleted, thanks to foreign keys on dms(user1_id,user2_id).
      await client.query('DELETE FROM group_messages WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM group_members WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM last_read_at WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM muted_groups WHERE user_id = $1', [userId]);

      // Learning and progress data
      await client.query('DELETE FROM conversations WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM onboarding_data WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_courses WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM daily_progress WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM speaking_sessions WHERE user_id = $1', [userId]);

      // Device and session data
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

      // OAuth providers
      await client.query('DELETE FROM user_oauth_providers WHERE user_id = $1', [userId]);

      // Finally delete the user
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      return { found: true, deletedUserId: userId };
    });
  },

  async getStats() {
    const registeredResult = await db.queryOne('SELECT COUNT(*) as count FROM users');
    const totalRegistered = parseInt(registeredResult?.count || 0);

    const onboardedResult = await db.queryOne(
      'SELECT COUNT(DISTINCT user_id) as count FROM onboarding_data'
    );
    const totalOnboarded = parseInt(onboardedResult?.count || 0);

    const callResult = await db.queryOne(
      'SELECT COUNT(DISTINCT user_id) as count FROM conversations'
    );
    const totalCalls = parseInt(callResult?.count || 0);

    const courseResult = await db.queryOne(
      'SELECT COUNT(DISTINCT user_id) as count FROM user_courses'
    );
    const totalCourses = parseInt(courseResult?.count || 0);

    const courseBasedDurationResult = await db.queryOne(
      'SELECT COALESCE(SUM(duration_seconds), 0) as total_duration_seconds FROM speaking_sessions WHERE duration_seconds > 0'
    );

    const totalConversationDurationSeconds = parseInt(courseBasedDurationResult?.total_duration_seconds || 0);

    return {
      totalRegistered,
      totalOnboarded,
      totalCalls,
      totalCourses,
      totalConversationDurationSeconds,
    };
  },

  async bulkDelete(userIds = []) {
    let deletedCount = 0;
    for (const id of userIds) {
      const result = await this.deleteUser(id);
      if (result.found) deletedCount++;
    }
    return { deletedCount };
  },

  async verifyAdmin(userId) {
    const row = await db.queryOne(
      'SELECT id, email, is_admin FROM users WHERE id = $1 AND is_admin = true',
      [userId]
    );
    return !!row;
  },

  async checkAdminStatus(userId) {
    const row = await db.queryOne('SELECT is_admin FROM users WHERE id = $1', [userId]);
    return !!(row && row.is_admin);
  },

  // Discount Token Management
  async createDiscountToken(tokenData) {
    const { token_code, discount_percent, plan_type, expires_at, max_uses, max_users, created_by } = tokenData;

    // Normalize token code to uppercase
    const normalizedCode = token_code.toUpperCase().trim();

    // Check if token code already exists
    const existing = await db.queryOne(
      'SELECT id FROM discount_tokens WHERE UPPER(TRIM(token_code)) = $1',
      [normalizedCode]
    );

    if (existing) {
      throw new Error('Token code already exists');
    }

    const result = await db.queryOne(
      `INSERT INTO discount_tokens 
       (token_code, discount_percent, plan_type, expires_at, max_uses, max_users, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [normalizedCode, discount_percent, plan_type || null, expires_at || null, max_uses || null, max_users || null, created_by]
    );

    return result;
  },

  async getDiscountTokens() {
    const tokens = await db.queryAll(
      `SELECT 
         dt.*,
         u.email as created_by_email,
         COALESCE(usage_stats.usage_count, 0) as usage_count
       FROM discount_tokens dt
       LEFT JOIN users u ON dt.created_by = u.id
       LEFT JOIN (
         SELECT token_id, COUNT(*) as usage_count
         FROM discount_token_usage
         GROUP BY token_id
       ) usage_stats ON dt.id = usage_stats.token_id
       ORDER BY dt.created_at DESC`
    );

    // Add status information
    const now = new Date();
    return tokens.map(token => {
      let status = 'active';
      if (!token.is_active) {
        status = 'inactive';
      } else if (token.expires_at && new Date(token.expires_at) < now) {
        status = 'expired';
      } else if (token.max_users !== null && token.unique_user_count >= token.max_users) {
        status = 'max_users_reached';
      }

      return {
        ...token,
        status,
        is_expired: token.expires_at ? new Date(token.expires_at) < now : false,
        unique_user_count: parseInt(token.unique_user_count || 0)
      };
    });
  },

  async updateDiscountToken(tokenId, updates) {
    const allowedFields = ['discount_percent', 'plan_type', 'expires_at', 'max_uses', 'max_users', 'is_active'];
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        updateFields.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Handle token_code update separately if provided
    if (updates.token_code) {
      const normalizedCode = updates.token_code.toUpperCase().trim();
      // Check if new code already exists (excluding current token)
      const existing = await db.queryOne(
        'SELECT id FROM discount_tokens WHERE UPPER(TRIM(token_code)) = $1 AND id != $2',
        [normalizedCode, tokenId]
      );
      if (existing) {
        throw new Error('Token code already exists');
      }
      updateFields.push(`token_code = $${paramIndex}`);
      values.push(normalizedCode);
      paramIndex++;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(tokenId);

    const result = await db.queryOne(
      `UPDATE discount_tokens 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!result) {
      throw new Error('Token not found');
    }

    return result;
  },

  async deleteDiscountToken(tokenId) {
    // Check if token has been used
    const usageCount = await db.queryOne(
      'SELECT COUNT(*) as count FROM discount_token_usage WHERE token_id = $1',
      [tokenId]
    );

    if (parseInt(usageCount?.count || 0) > 0) {
      // Soft delete by deactivating
      return await db.queryOne(
        'UPDATE discount_tokens SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [tokenId]
      );
    } else {
      // Hard delete if never used
      await db.queryOne('DELETE FROM discount_tokens WHERE id = $1', [tokenId]);
      return { id: tokenId, deleted: true };
    }
  },
};

module.exports = adminService;
