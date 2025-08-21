const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { authenticateToken, requireAdmin } = require('./auth-routes');

// GET /api/admin/users - Get all users with search and pagination
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  let client;
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    client = await pool.connect();
    
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
        COALESCE(call_stats.completed_calls, 0) as completed_calls,
        COALESCE(last_activity.last_activity, u.created_at) as last_activity,
        CASE 
          WHEN has_onboarding.has_onboarding = true AND call_stats.user_id IS NOT NULL THEN 'Both'
          WHEN has_onboarding.has_onboarding = true THEN 'Onboarded'
          WHEN call_stats.user_id IS NOT NULL THEN 'Active'
          ELSE 'Registered'
        END as status
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) as completed_calls
        FROM conversations
        GROUP BY user_id
      ) call_stats ON u.id = call_stats.user_id
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
    
    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unable to retrieve user list at this time. Please try again later.'
    });
  } finally {
    if (client) client.release();
  }
});

// DELETE /api/admin/users/:userId - Delete user and all related data
router.delete('/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  let client;
  try {
    const { userId } = req.params;
    
    client = await pool.connect();
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
      // User not found
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
    
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unable to delete user at this time. Please try again later.'
    });
  } finally {
    if (client) client.release();
  }
});

// GET /api/admin/stats - Get user statistics
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    
    // Get total registered users
    const registeredResult = await client.query('SELECT COUNT(*) as count FROM users');
    const totalRegistered = parseInt(registeredResult.rows[0].count);
    
    // Get total users with onboarding data
    const onboardedResult = await client.query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM onboarding_data
    `);
    const totalOnboarded = parseInt(onboardedResult.rows[0].count);
    
    // Get total users with conversations
    const callResult = await client.query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM conversations
    `);
    const totalCalls = parseInt(callResult.rows[0].count);
    
    // Get total users with courses
    const courseResult = await client.query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM user_courses
    `);
    const totalCourses = parseInt(courseResult.rows[0].count);
    
    res.json({
      totalRegistered,
      totalOnboarded,
      totalCalls,
      totalCourses
    });
    
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unable to retrieve statistics at this time. Please try again later.'
    });
  } finally {
    if (client) client.release();
  }
});

// POST /api/admin/users/bulk-delete - Bulk delete users
router.post('/users/bulk-delete', authenticateToken, requireAdmin, async (req, res) => {
  let client;
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }
    
    client = await pool.connect();
    await client.query('BEGIN');
    
    let deletedCount = 0;
    
    for (const userId of userIds) {
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
        console.log(`🗑️ Bulk deleting user ID ${userId} and ALL related data...`);
        
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
        // User not found
        continue; // Skip if user not found
      }
      
      deletedCount++;
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `${deletedCount} ${deletedCount === 1 ? 'user/device' : 'users/devices'} deleted successfully` 
    });
    
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error bulk deleting users:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unable to delete users at this time. Please try again later.'
    });
  } finally {
    if (client) client.release();
  }
});

// GET /api/admin/verify-admin - Verify admin status (for frontend admin login)
router.get('/verify-admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Admin verification request received for user:', req.user.userId);
    
    // Additional database check to ensure user still exists and is admin
    let client;
    try {
      client = await pool.connect();
      
      const { rows } = await client.query(
        'SELECT id, email, is_admin FROM users WHERE id = $1 AND is_admin = true',
        [req.user.userId]
      );
      
      if (rows.length === 0) {
        console.warn(`⚠️  Admin verification failed: User ${req.user.userId} not found or not admin`);
        return res.status(403).json({
          success: false,
          error: 'Admin privileges not found'
        });
      }
      
      console.log('✅ Admin verification successful for user:', req.user.userId);
      
      res.json({
        success: true,
        isAdmin: true,
        message: 'Admin access verified',
        user: {
          id: rows[0].id,
          email: rows[0].email
        }
      });
      
    } catch (dbError) {
      console.error('❌ Database error during admin verification:', dbError);
      res.status(503).json({
        success: false,
        error: 'Database connection error. Please try again later.'
      });
    } finally {
      if (client) client.release();
    }
    
  } catch (error) {
    console.error('❌ Error verifying admin status:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to verify admin status at this time. Please try again later.'
    });
  }
});

// GET /api/admin/check-admin-status - Check if current user is admin (for regular user session)
router.get('/check-admin-status', authenticateToken, async (req, res) => {
  try {
    let client;
    try {
      client = await pool.connect();
      
      // Check if user has admin privileges
      const { rows } = await client.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [req.user.userId]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      res.json({
        success: true,
        isAdmin: rows[0].is_admin || false
      });
      
    } finally {
      if (client) client.release();
    }
    
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to check admin status at this time. Please try again later.'
    });
  }
});

module.exports = router;
