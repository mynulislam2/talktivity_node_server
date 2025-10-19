const express = require("express");
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth-routes');

// Test endpoint to check if manual activation routes are working
router.get('/manual-activate-subscription', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Manual activation endpoint is accessible',
    method: 'GET'
  });
});

// Test POST endpoint without authentication
router.post('/test-manual-activation', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Manual activation POST endpoint is accessible',
    method: 'POST'
  });
});

// Manual subscription activation endpoint (for testing/fallback)
router.post('/manual-activate-subscription', authenticateToken, async (req, res) => {
  let client;
  try {
    const userId = req.user.userId;
    client = await db.pool.connect();
    
    console.log(`🔄 Manual activation requested for user ${userId}`);
    console.log(`📊 Manual activation: Request method: ${req.method}`);
    console.log(`📊 Manual activation: Request URL: ${req.url}`);
    console.log(`📊 Manual activation: Request headers:`, req.headers);
    
    // Find pending subscription for this user
    const result = await client.query(`
      SELECT s.*, sp.plan_type, sp.duration_months
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = $1 AND s.status = 'pending'
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'No pending subscription found' 
      });
    }
    
    const subscription = result.rows[0];
    
    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + subscription.duration_months);
    
    // Update subscription to active
    await client.query(`
      UPDATE subscriptions 
      SET status = 'active', start_date = $1, end_date = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [startDate, endDate, subscription.id]);
    
    console.log(`✅ Subscription ${subscription.id} activated for user ${userId}`);
    
    res.json({ 
      success: true, 
      message: 'Subscription activated successfully',
      subscription: {
        id: subscription.id,
        plan_type: subscription.plan_type,
        start_date: startDate,
        end_date: endDate,
        status: 'active'
      }
    });
    
  } catch (error) {
    console.error('Manual activation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to activate subscription' 
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
