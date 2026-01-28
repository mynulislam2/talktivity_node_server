/**
 * Admin Module Service
 * Implements admin queries for users, stats, and deletion.
 */

const db = require('../../core/db/client');

const adminService = {
  async getUsers({ search, page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;

    let searchCondition = '';
    const queryParams = [];

    if (search) {
      searchCondition = 'AND (u.email ILIKE $1 OR u.full_name ILIKE $1 OR u.id::text ILIKE $1)';
      queryParams.push(`%${search}%`);
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
        END as status
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
      WHERE 1=1 ${searchCondition}
      ORDER BY u.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const users = await db.queryAll(usersQuery, [...queryParams, limit, offset]);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      WHERE 1=1 ${searchCondition}
    `;
    const countResult = await db.queryOne(countQuery, search ? [search] : []);
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
};

module.exports = adminService;
