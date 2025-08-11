const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');

// GET /api/admin/users - Get users with filters
router.get('/users', async (req, res) => {
  let client;
  try {
    const { primaryFilter, secondaryFilter, searchTerm } = req.query;
    
    client = await pool.connect();
    
    let query = '';
    let params = [];
    let searchCondition = '';
    
    // Add search condition if searchTerm is provided
    if (searchTerm && searchTerm.trim()) {
      if (primaryFilter === 'registered') {
        // Search by email for registered users
        searchCondition = 'AND u.email ILIKE $1';
        params.push(`%${searchTerm.trim()}%`);
      } else {
        // Search by device_id/fingerprint_id for non-registered devices
        searchCondition = 'AND (od.fingerprint_id ILIKE $1 OR dc.device_id ILIKE $1)';
        params.push(`%${searchTerm.trim()}%`);
      }
    }
    
          if (primaryFilter === 'registered') {
        // Get registered users
        query = `
          SELECT 
            u.id,
            u.full_name as name,
            u.email,
            u.created_at as registration_date,
            COALESCE(call_stats.completed_calls, 0) as completed_calls,
            COALESCE(last_activity.last_activity, u.created_at) as last_activity,
            'Registered' as activity_type,
            true as is_registered
          FROM users u
          LEFT JOIN (
            SELECT 
              user_id,
              COUNT(*) as completed_calls
            FROM conversations 
            GROUP BY user_id
          ) call_stats ON u.id = call_stats.user_id
          LEFT JOIN (
            SELECT 
              user_id,
              MAX(timestamp) as last_activity
            FROM conversations
            GROUP BY user_id
          ) last_activity ON u.id = last_activity.user_id
          WHERE 1=1 ${searchCondition}
          ORDER BY last_activity DESC
        `;
    } else {
      // Get non-registered devices
              if (secondaryFilter === 'onboarded') {
          query = `
            SELECT 
              od.fingerprint_id as id,
              NULL as name,
              NULL as email,
              NULL as registration_date,
              COALESCE(call_stats.completed_calls, 0) as completed_calls,
              COALESCE(last_activity.last_activity, od.created_at) as last_activity,
              'Onboarded' as activity_type,
              false as is_registered
            FROM onboarding_data od
            LEFT JOIN (
              SELECT 
                device_id,
                COUNT(*) as completed_calls
              FROM device_conversations 
              GROUP BY device_id
            ) call_stats ON od.fingerprint_id = call_stats.device_id
            LEFT JOIN (
              SELECT 
                device_id,
                MAX(timestamp) as last_activity
              FROM device_conversations
              GROUP BY device_id
            ) last_activity ON od.fingerprint_id = last_activity.device_id
            WHERE od.fingerprint_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
            ${searchCondition}
            ORDER BY last_activity DESC
          `;
              } else if (secondaryFilter === 'call') {
          query = `
            SELECT 
              dc.device_id as id,
              NULL as name,
              NULL as email,
              NULL as registration_date,
              COUNT(*) as completed_calls,
              MAX(dc.timestamp) as last_activity,
              'Call' as activity_type,
              false as is_registered
            FROM device_conversations dc
            WHERE dc.device_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
            ${searchCondition}
            GROUP BY dc.device_id
            ORDER BY last_activity DESC
          `;
              } else {
                  // Both - show all non-registered devices with any activity
          query = `
            SELECT 
              COALESCE(od.fingerprint_id, dc.device_id) as id,
              NULL as name,
              NULL as email,
              NULL as registration_date,
              COALESCE(call_stats.completed_calls, 0) as completed_calls,
              COALESCE(last_activity.last_activity, COALESCE(od.created_at, dc.timestamp)) as last_activity,
              CASE 
                WHEN od.fingerprint_id IS NOT NULL AND dc.device_id IS NOT NULL THEN 'Both'
                WHEN od.fingerprint_id IS NOT NULL THEN 'Onboarded'
                ELSE 'Call'
              END as activity_type,
              false as is_registered
            FROM (
              SELECT DISTINCT fingerprint_id FROM onboarding_data
              WHERE fingerprint_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
              ${searchCondition ? 'AND fingerprint_id ILIKE $1' : ''}
              UNION
              SELECT DISTINCT device_id as fingerprint_id FROM device_conversations
              WHERE device_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
              ${searchCondition ? 'AND device_id ILIKE $1' : ''}
            ) all_devices
            LEFT JOIN onboarding_data od ON all_devices.fingerprint_id = od.fingerprint_id
            LEFT JOIN device_conversations dc ON all_devices.fingerprint_id = dc.device_id
            LEFT JOIN (
              SELECT 
                device_id,
                COUNT(*) as completed_calls
              FROM device_conversations 
              WHERE device_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
              GROUP BY device_id
            ) call_stats ON all_devices.fingerprint_id = call_stats.device_id
            LEFT JOIN (
              SELECT 
                device_id,
                MAX(timestamp) as last_activity
              FROM device_conversations
              WHERE device_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
              GROUP BY device_id
            ) last_activity ON all_devices.fingerprint_id = last_activity.device_id
            GROUP BY all_devices.fingerprint_id, od.fingerprint_id, dc.device_id, call_stats.completed_calls, last_activity.last_activity, od.created_at, dc.timestamp
            ORDER BY last_activity DESC
          `;
      }
    }
    
    const result = await client.query(query, params);
    
    // Transform the data to match frontend expectations
    const users = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      registrationDate: row.registration_date,
      completedCalls: parseInt(row.completed_calls) || 0,
      lastActivity: row.last_activity,
      activityType: row.activity_type,
      isRegistered: row.is_registered
    }));
    
    res.json({ users });
    
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users',
      details: error.message 
    });
  } finally {
    if (client) client.release();
  }
});

// DELETE /api/admin/users/:userId - Delete user/device and all related data
router.delete('/users/:userId', async (req, res) => {
  let client;
  try {
    const { userId } = req.params;
    
    client = await pool.connect();
    await client.query('BEGIN');
    
    // Check if it's a registered user or device
    const userCheck = await client.query(
      'SELECT id, fingerprint_id FROM users WHERE id = $1 OR fingerprint_id = $1',
      [userId]
    );
    
    const isRegisteredUser = userCheck.rows.length > 0;
    const fingerprintId = isRegisteredUser ? userCheck.rows[0].fingerprint_id : userId;
    
    if (isRegisteredUser) {
      // Delete registered user and all related data
      await client.query('DELETE FROM conversations WHERE user_id = $1', [userCheck.rows[0].id]);
      await client.query('DELETE FROM onboarding_data WHERE fingerprint_id = $1', [fingerprintId]);
      await client.query('DELETE FROM users WHERE id = $1', [userCheck.rows[0].id]);
    } else {
      // Delete device and all related data
      await client.query('DELETE FROM device_conversations WHERE device_id = $1', [fingerprintId]);
      await client.query('DELETE FROM onboarding_data WHERE fingerprint_id = $1', [fingerprintId]);
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `${isRegisteredUser ? 'User' : 'Device'} deleted successfully` 
    });
    
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error deleting user/device:', error);
    res.status(500).json({ 
      error: 'Failed to delete user/device',
      details: error.message 
    });
  } finally {
    if (client) client.release();
  }
});

// GET /api/admin/stats - Get user statistics
router.get('/stats', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    
    // Get total registered users
    const registeredResult = await client.query('SELECT COUNT(*) as count FROM users');
    const totalRegistered = parseInt(registeredResult.rows[0].count);
    
    // Get total non-registered devices with onboarding
    const onboardedResult = await client.query(`
      SELECT COUNT(DISTINCT od.fingerprint_id) as count 
      FROM onboarding_data od 
      WHERE od.fingerprint_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
    `);
    const totalOnboarded = parseInt(onboardedResult.rows[0].count);
    
    // Get total non-registered devices with calls
    const callResult = await client.query(`
      SELECT COUNT(DISTINCT dc.device_id) as count 
      FROM device_conversations dc
    `);
    const totalCalls = parseInt(callResult.rows[0].count);
    
    // Get total non-registered devices (unique)
    const notRegisteredResult = await client.query(`
      SELECT COUNT(DISTINCT fingerprint_id) as count 
      FROM (
        SELECT fingerprint_id FROM onboarding_data
        UNION
        SELECT device_id as fingerprint_id FROM device_conversations
      ) all_devices
      WHERE fingerprint_id NOT IN (SELECT fingerprint_id FROM users WHERE fingerprint_id IS NOT NULL)
    `);
    const totalNotRegistered = parseInt(notRegisteredResult.rows[0].count);
    
    res.json({
      totalRegistered,
      totalNotRegistered,
      totalOnboarded,
      totalCalls
    });
    
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      details: error.message 
    });
  } finally {
    if (client) client.release();
  }
});

// POST /api/admin/users/bulk-delete - Bulk delete users
router.post('/users/bulk-delete', async (req, res) => {
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
      // Check if it's a registered user or device
      const userCheck = await client.query(
        'SELECT id, fingerprint_id FROM users WHERE id = $1 OR fingerprint_id = $1',
        [userId]
      );
      
      const isRegisteredUser = userCheck.rows.length > 0;
      const fingerprintId = isRegisteredUser ? userCheck.rows[0].fingerprint_id : userId;
      
      if (isRegisteredUser) {
        // Delete registered user and all related data
        await client.query('DELETE FROM conversations WHERE user_id = $1', [userCheck.rows[0].id]);
        await client.query('DELETE FROM onboarding_data WHERE fingerprint_id = $1', [fingerprintId]);
        await client.query('DELETE FROM users WHERE id = $1', [userCheck.rows[0].id]);
      } else {
        // Delete device and all related data
        await client.query('DELETE FROM device_conversations WHERE device_id = $1', [fingerprintId]);
        await client.query('DELETE FROM onboarding_data WHERE fingerprint_id = $1', [fingerprintId]);
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
      error: 'Failed to delete users',
      details: error.message 
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
