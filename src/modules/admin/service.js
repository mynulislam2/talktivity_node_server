// src/modules/admin/service.js
// Admin business logic

const db = require('../../core/db/client');

// Get all users with search and pagination
const getAllUsers = async (search, page = 1, limit = 20) => {
  let client;
  try {
    const offset = (page - 1) * limit;
    
    client = await db.pool.connect();
    
    let searchCondition = '';
    let queryParams = [];
    
    if (search) {
      // Search by user email, name, or id
      searchCondition = 'AND (u.email ILIKE $1 OR u.full_name ILIKE $1 OR u.id::text ILIKE $1)';
      queryParams.push(`%${search}%`);
    }
    
    // Get registered users with their stats - Fixed to prevent duplicates
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
    
    queryParams.push(limit, offset);
    
    const result = await client.query(usersQuery, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      WHERE 1=1 ${searchCondition}
    `;
    
    const countResult = await client.query(countQuery, search ? [search] : []);
    const total = parseInt(countResult.rows[0].total);
    
    return {
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
    
  } finally {
    if (client) client.release();
  }
};

// Delete user and all related data
const deleteUser = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    
    // Try to find user by id
    let userCheck = await client.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );
    
    // If not found by id, try to find by email
    if (userCheck.rows.length === 0) {
      userCheck = await client.query(
        'SELECT id, email FROM users WHERE email = $1',
        [userId]
      );
    }
    
    const isRegisteredUser = userCheck.rows.length > 0;
    
    if (isRegisteredUser) {
      const userId = userCheck.rows[0].id;
      console.log(`🗑️ Deleting user ID ${userId} and ALL related data...`);
      
      // Delete ALL user-related data from every table
      // Group chat and messaging data
      await client.query('DELETE FROM dm_messages WHERE sender_id = $1', [userId]);
      await client.query('DELETE FROM dm_participants WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM group_messages WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM group_members WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM last_read_at WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM muted_groups WHERE user_id = $1', [userId]);
      
      // Learning and progress data
      await client.query('DELETE FROM conversations WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM onboarding_data WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_courses WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM daily_progress WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM weekly_exams WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM speaking_sessions WHERE user_id = $1', [userId]);
      
      // Device and session data
      await client.query('DELETE FROM device_conversations WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM device_speaking_sessions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_devices WHERE user_id = $1', [userId]);
      
      // Also clean up any device-based records that might be orphaned
      // Get user's email to match with device records
      const userEmail = userCheck.rows[0].email;
      if (userEmail) {
        // Delete device conversations that might be linked by email or other identifiers
        await client.query('DELETE FROM device_conversations WHERE device_id ILIKE $1', [`%${userEmail}%`]);
        await client.query('DELETE FROM device_speaking_sessions WHERE device_id ILIKE $1', [`%${userEmail}%`]);
      }
      
      // OAuth and authentication data
      await client.query('DELETE FROM user_oauth_providers WHERE user_id = $1', [userId]);
      
      // Finally delete the user
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      
      console.log(`✅ User ID ${userId} and ALL related data deleted successfully.`);
    } else {
      throw new Error('User not found');
    }
    
    await client.query('COMMIT');
    
    return { 
      success: true, 
      message: 'User deleted successfully' 
    };
    
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (client) client.release();
  }
};

// Get user statistics
const getUserStats = async () => {
  let client;
  try {
    client = await db.pool.connect();
    
    // Get total users
    const totalUsersResult = await client.query('SELECT COUNT(*) as total FROM users');
    const totalUsers = parseInt(totalUsersResult.rows[0].total);
    
    // Get users with onboarding data
    const onboardedUsersResult = await client.query(`
      SELECT COUNT(DISTINCT user_id) as onboarded 
      FROM onboarding_data
    `);
    const onboardedUsers = parseInt(onboardedUsersResult.rows[0].onboarded);
    
    // Get users with conversations
    const activeUsersResult = await client.query(`
      SELECT COUNT(DISTINCT user_id) as active 
      FROM conversations
    `);
    const activeUsers = parseInt(activeUsersResult.rows[0].active);
    
    // Get users with both onboarding and conversations
    const engagedUsersResult = await client.query(`
      SELECT COUNT(DISTINCT o.user_id) as engaged
      FROM onboarding_data o
      JOIN conversations c ON o.user_id = c.user_id
    `);
    const engagedUsers = parseInt(engagedUsersResult.rows[0].engaged);
    
    // Get recent signups (last 7 days)
    const recentSignupsResult = await client.query(`
      SELECT COUNT(*) as recent
      FROM users
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const recentSignups = parseInt(recentSignupsResult.rows[0].recent);
    
    return {
      totalUsers,
      onboardedUsers,
      activeUsers,
      engagedUsers,
      recentSignups,
      onboardedPercentage: totalUsers > 0 ? Math.round((onboardedUsers / totalUsers) * 100) : 0,
      activePercentage: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
      engagedPercentage: totalUsers > 0 ? Math.round((engagedUsers / totalUsers) * 100) : 0
    };
    
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getAllUsers,
  deleteUser,
  getUserStats
};