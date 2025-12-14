const express = require("express");
const router = express.Router();
const db = require('../db');

// Middleware to authenticate token
const authenticateToken = require('./auth-routes').authenticateToken;

// Note: Payment gateway is now AamarPay
// Use /api/payments/aamarpay/payment for payment creation

// Rate limiting for payment creation
const paymentAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const checkRateLimit = (userId) => {
  const now = Date.now();
  const userAttempts = paymentAttempts.get(userId) || [];
  
  // Remove old attempts
  const recentAttempts = userAttempts.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return false;
  }
  
  recentAttempts.push(now);
  paymentAttempts.set(userId, recentAttempts);
  return true;
};

// Log payment events for audit
const logPaymentEvent = async (eventType, userId, data, req) => {
  let client;
  try {
    client = await db.pool.connect();
    await client.query(`
      INSERT INTO payment_audit_log (event_type, user_id, data, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      eventType,
      userId,
      JSON.stringify(data),
      req.ip || req.connection.remoteAddress,
      req.headers['user-agent']
    ]);
  } catch (error) {
    console.error('Error logging payment event:', error);
  } finally {
    if (client) client.release();
  }
};

// Get plan details
const getPlanDetails = async (planType) => {
  let client;
  try {
    client = await db.pool.connect();
    const result = await client.query(
      'SELECT * FROM subscription_plans WHERE plan_type = $1 AND is_active = true',
      [planType]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error getting plan details:', error);
    throw error;
  } finally {
    if (client) client.release();
  }
};

// Payment creation is now handled by AamarPay
// Use POST /api/payments/aamarpay/payment instead

// Get subscription status (authenticated)
router.get('/subscription/status', authenticateToken, async (req, res) => {
  let client;
  try {
    const userId = req.user.userId;
    console.log(`🔄 Backend: Checking subscription status for user ${userId}`);
    
    client = await db.pool.connect();
    const result = await client.query(`
      SELECT s.*, p.plan_type, p.features, p.price
      FROM subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);
    
    console.log(`📊 Backend: Found ${result.rows.length} active subscriptions for user ${userId}`);
    if (result.rows.length > 0) {
      console.log(`📊 Backend: Subscription details:`, result.rows[0]);
    }
    
    const subscription = result.rows[0];
    const isActive = !!subscription;
    
    console.log(`📊 Backend: isActive = ${isActive}`);
    
    res.json({ 
      success: true, 
      data: { 
        active: isActive,
        subscription: subscription || null
      } 
    });
    
  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch subscription status' 
    });
  } finally {
    if (client) client.release();
  }
});

// Get user's payment history
router.get('/payments/history', authenticateToken, async (req, res) => {
  let client;
  try {
    const userId = req.user.userId;
    
    client = await db.pool.connect();
    const result = await client.query(`
      SELECT pt.*, p.plan_type, p.plan_name
      FROM payment_transactions pt
      LEFT JOIN subscriptions s ON pt.subscription_id = s.id
      LEFT JOIN subscription_plans p ON s.plan_id = p.id
      WHERE pt.user_id = $1
      ORDER BY pt.created_at DESC
    `, [userId]);
    
    res.json({ 
      success: true, 
      data: result.rows 
    });
    
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch payment history' 
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
