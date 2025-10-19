const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const router = express.Router();
const db = require('../db');

// Middleware to authenticate token
const authenticateToken = require('./auth-routes').authenticateToken;

// Environment variables for security
const MONEYBAG_API_KEY = process.env.MONEYBAG_API_KEY;
const MONEYBAG_API_URL = process.env.MONEYBAG_API_URL || "https://sandbox.api.moneybag.com.bd/api/v2";
const MONEYBAG_WEBHOOK_SECRET = process.env.MONEYBAG_WEBHOOK_SECRET;

// Validate required environment variables
if (!MONEYBAG_API_KEY) {
  console.error('❌ CRITICAL: MONEYBAG_API_KEY environment variable is required');
  process.exit(1);
}

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

// Create secure payment endpoint
router.post("/create-payment", authenticateToken, async (req, res) => {
  let client;
  try {
    const { planType } = req.body;
    const userId = req.user.userId;
    
    // Validate input
    if (!planType || !['Basic', 'Pro'].includes(planType)) {
      await logPaymentEvent('invalid_plan_type', userId, { planType }, req);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid plan type. Must be Basic or Pro.' 
      });
    }
    
    // Check rate limiting
    if (!checkRateLimit(userId)) {
      await logPaymentEvent('rate_limit_exceeded', userId, { planType }, req);
      return res.status(429).json({ 
        success: false, 
        error: 'Too many payment attempts. Please try again later.' 
      });
    }
    
    // Check if user already has active subscription
    client = await db.pool.connect();
    const existingSubscription = await client.query(`
      SELECT s.*, p.plan_type 
      FROM subscriptions s 
      JOIN subscription_plans p ON s.plan_id = p.id 
      WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
    `, [userId]);
    
    if (existingSubscription.rows.length > 0) {
      await logPaymentEvent('existing_subscription', userId, { 
        existingPlan: existingSubscription.rows[0].plan_type 
      }, req);
      return res.status(400).json({ 
        success: false, 
        error: 'You already have an active subscription.' 
      });
    }
    
    // Get plan details
    const plan = await getPlanDetails(planType);
    if (!plan) {
      await logPaymentEvent('plan_not_found', userId, { planType }, req);
      return res.status(400).json({ 
        success: false, 
        error: 'Plan not found or inactive.' 
      });
    }
    
    // Create order ID
    const orderId = `ORDER_${userId}_${Date.now()}`;
    
    // Create pending subscription
    const subscriptionResult = await client.query(`
      INSERT INTO subscriptions (user_id, plan_id, status, payment_id)
      VALUES ($1, $2, 'pending', $3)
      RETURNING id
    `, [userId, plan.id, orderId]);
    
    const subscriptionId = subscriptionResult.rows[0].id;
    
    // Prepare payment data
    const requestData = {
      order_id: orderId,
      order_amount: parseFloat(plan.price),
      currency: "BDT",
      order_description: `Talktivity ${planType} Subscription - ${plan.duration_months} months`,
      success_url: `${process.env.FRONTEND_URL || 'https://talktivity.app'}/payment-success`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://talktivity.app'}/upgrade`,
      fail_url: `${process.env.FRONTEND_URL || 'https://talktivity.app'}/upgrade`,
      customer: {
        name: req.user.full_name || "Talktivity User",
        email: req.user.email,
        phone: req.user.phone || "+8801712345678",
        address: req.user.address || "123 Main Street",
        city: req.user.city || "Dhaka",
        postcode: req.user.postcode || "1205",
        country: "BD"
      },
    };
    
    // Log payment creation attempt
    await logPaymentEvent('payment_creation_attempt', userId, { 
      orderId, 
      planType, 
      amount: plan.price 
    }, req);
    
    // Create payment with Moneybag
    const response = await axios.post(
      `${MONEYBAG_API_URL}/payments/checkout`,
      requestData,
      {
        headers: {
          "X-Merchant-API-Key": MONEYBAG_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    if (response.data && response.data.success && response.data.data && response.data.data.checkout_url) {
      // Store transaction record
      await client.query(`
        INSERT INTO payment_transactions (user_id, subscription_id, transaction_id, order_id, amount, currency, status, payment_method)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'Moneybag')
      `, [userId, subscriptionId, `TXN_${Date.now()}`, orderId, plan.price, 'BDT']);
      
      await logPaymentEvent('payment_created', userId, { 
        orderId, 
        checkoutUrl: response.data.data.checkout_url 
      }, req);
      
      res.json({ 
        success: true, 
        payment_url: response.data.data.checkout_url,
        order_id: orderId
      });
    } else {
      throw new Error('Invalid response from payment gateway');
    }
    
  } catch (error) {
    console.error("Payment creation error:", error);
    
    await logPaymentEvent('payment_creation_error', req.user?.userId, { 
      error: error.message 
    }, req);
    
    res.status(500).json({
      success: false,
      error: "Payment creation failed. Please try again."
    });
  } finally {
    if (client) client.release();
  }
});

// Payment webhook endpoint
router.post('/payment-webhook', async (req, res) => {
  let client;
  try {
    const { order_id, status, amount, signature } = req.body;
    
    // Verify webhook signature if secret is provided
    if (MONEYBAG_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', MONEYBAG_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }
    
    client = await db.pool.connect();
    
    // Get transaction details
    const transactionResult = await client.query(`
      SELECT pt.*, s.id as subscription_id, s.user_id
      FROM payment_transactions pt
      LEFT JOIN subscriptions s ON pt.subscription_id = s.id
      WHERE pt.order_id = $1
    `, [order_id]);
    
    if (transactionResult.rows.length === 0) {
      console.error('Transaction not found:', order_id);
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const transaction = transactionResult.rows[0];
    
    // Update transaction status
    await client.query(`
      UPDATE payment_transactions 
      SET status = $1, gateway_response = $2, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $3
    `, [status, JSON.stringify(req.body), order_id]);
    
    if (status === 'success') {
      // Calculate subscription dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 2); // 2 months duration
      
      // Update subscription to active
      await client.query(`
        UPDATE subscriptions 
        SET status = 'active', start_date = $1, end_date = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [startDate, endDate, transaction.subscription_id]);
      
      // Log successful payment
      await logPaymentEvent('payment_success', transaction.user_id, {
        order_id,
        amount,
        subscription_id: transaction.subscription_id
      }, req);
      
      console.log(`Payment successful for order ${order_id}, user ${transaction.user_id}`);
    } else {
      // Update subscription to failed
      await client.query(`
        UPDATE subscriptions 
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [transaction.subscription_id]);
      
      await logPaymentEvent('payment_failed', transaction.user_id, {
        order_id,
        status,
        amount
      }, req);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    if (client) client.release();
  }
});

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
