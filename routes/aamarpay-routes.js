const express = require("express");
const router = express.Router();
const { Payment } = require("aamarpay.v2");
const { authenticateToken } = require('./auth-routes');
const db = require('../db');

// Configuration from environment variables or use defaults
const AAMARPAY_STORE_ID = process.env.AAMARPAY_STORE_ID || "aamarpaytest";
const AAMARPAY_SIGNATURE_KEY = process.env.AAMARPAY_SIGNATURE_KEY || "dbb74894e82415a2f7ff0ec3a97e4183";
const IS_SANDBOX = process.env.AAMARPAY_SANDBOX !== "false"; // Default to sandbox (true) unless explicitly set to false
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

// Make a pay instance from the Payment class
const Pay = new Payment(
  AAMARPAY_STORE_ID, // store id
  AAMARPAY_SIGNATURE_KEY, // signature key
  !IS_SANDBOX // for sandbox test if you want to live make it true
);

// Helper function to get plan details
const getPlanDetails = async (planType) => {
  let client;
  try {
    client = await db.pool.connect();
    const result = await client.query(
      'SELECT * FROM subscription_plans WHERE plan_type = $1 AND is_active = true ORDER BY id DESC LIMIT 1',
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

// POST route for creating payment (used by checkout page)
router.post('/aamarpay/payment', authenticateToken, async (req, res) => {
  let client;
  try {
    const { planType, amount, currency, cus_email, cus_name, cus_phone, cus_add1, desc } = req.body;
    const userId = req.user.userId;

    // Get plan details from database
    const plan = await getPlanDetails(planType);
    if (!plan) {
      return res.status(400).json({
        success: false,
        error: `Plan type "${planType}" not found`
      });
    }

    // Generate unique transaction ID
    const tran_id = `TALK_${userId}_${Date.now()}`;
    const paymentAmount = parseFloat(amount || (planType === "Pro" ? "5000" : "2000"));

    // Save pending subscription and payment transaction to database
    client = await db.pool.connect();
    
    // Start transaction
    await client.query('BEGIN');

    // Create pending subscription
    const subscriptionResult = await client.query(`
      INSERT INTO subscriptions (user_id, plan_id, status, payment_id, created_at, updated_at)
      VALUES ($1, $2, 'pending', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [userId, plan.id, tran_id]);

    const subscriptionId = subscriptionResult.rows[0].id;

    // Create pending payment transaction
    await client.query(`
      INSERT INTO payment_transactions (user_id, subscription_id, transaction_id, order_id, amount, currency, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [userId, subscriptionId, tran_id, tran_id, paymentAmount, currency || "BDT"]);

    // Commit transaction
    await client.query('COMMIT');

    // Prepare payment data
    const paymentData = {
      data: {
        amount: paymentAmount.toString(),
        currency: currency || "BDT",
        cus_email: cus_email || req.user.email || "user@example.com",
        cus_name: cus_name || req.user.full_name || "Talktivity User",
        cus_phone: cus_phone || req.user.phone || "01XXXXXXXX",
        desc: desc || `Talktivity ${planType || "Basic"} Plan Subscription`,
        tran_id: tran_id,
        cus_add1: cus_add1 || req.user.address || "N/A",
      },
      cancel_url: `${FRONTEND_URL}/api/payment-cancel-redirect?order_id=${tran_id}`,
      fail_url: `${FRONTEND_URL}/api/payment-failed-redirect?order_id=${tran_id}`,
      success_url: `${FRONTEND_URL}/api/payment-success-redirect?order_id=${tran_id}`,
    };

    const paymentResponse = await Pay.init(paymentData);
    
    res.json({
      success: true,
      payment_url: paymentResponse,
      order_id: tran_id
    });
  } catch (e) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    console.error('Payment initialization error:', e);
    res.status(500).json({
      success: false,
      error: e.message || 'Payment initialization failed'
    });
  } finally {
    if (client) client.release();
  }
});

// GET route for direct payment access (for testing or direct links)
router.get('/aamarpay/payment', async (req, res) => {
  try {
    const paymentResponse = await Pay.init({
      data: {
        amount: req.query.amount || "100",
        currency: req.query.currency || "BDT",
        cus_email: req.query.cus_email || "nahid@gmail.com",
        cus_name: req.query.cus_name || "nahid hasan",
        cus_phone: req.query.cus_phone || "01XXXXXXXX",
        desc: req.query.desc || "This is a demo",
        tran_id: req.query.tran_id || `202312171066nahid_${Date.now()}`,
        cus_add1: req.query.cus_add1 || "demo address",
      },
      cancel_url: req.query.cancel_url || `${FRONTEND_URL}/api/payment-cancel-redirect`,
      fail_url: req.query.fail_url || `${FRONTEND_URL}/api/payment-failed-redirect`,
      success_url: req.query.success_url || `${FRONTEND_URL}/api/payment-success-redirect`,
    });
    
    res.redirect(paymentResponse);
  } catch (e) {
    console.error('Payment initialization error:', e);
    res.status(500).send(e.message || 'Payment initialization failed');
  }
});

// Process payment success - called from frontend redirect API
router.post('/aamarpay/process-success', express.json(), async (req, res) => {
  let client;
  try {
    const aamarpayResponse = req.body;
    const orderId = aamarpayResponse.mer_txnid || aamarpayResponse.order_id || aamarpayResponse.tran_id;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID not found in response' });
    }

    const statusCode = aamarpayResponse.status_code;
    const payStatus = aamarpayResponse.pay_status || '';
    const isSuccessful = statusCode === '2' && (payStatus.toLowerCase().includes('success') || payStatus.toLowerCase() === 'successful');

    client = await db.pool.connect();
    await client.query('BEGIN');

    // Find payment transaction by order_id
    const paymentResult = await client.query(`
      SELECT pt.*, s.id as subscription_id, s.plan_id, sp.duration_days
      FROM payment_transactions pt
      LEFT JOIN subscriptions s ON pt.subscription_id = s.id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE pt.order_id = $1
      ORDER BY pt.created_at DESC
      LIMIT 1
    `, [orderId]);

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Payment transaction not found' });
    }

    const payment = paymentResult.rows[0];
    const transactionId = aamarpayResponse.pg_txnid || aamarpayResponse.epw_txnid || payment.transaction_id;

    // Update payment transaction
    await client.query(`
      UPDATE payment_transactions
      SET transaction_id = $1,
          status = $2,
          payment_method = $3,
          gateway_response = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [
      transactionId,
      isSuccessful ? 'success' : 'failed',
      aamarpayResponse.card_type || 'aamarPay',
      JSON.stringify(aamarpayResponse),
      payment.id
    ]);

    // If payment successful, activate subscription
    if (isSuccessful && payment.subscription_id) {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + (payment.duration_days || 60));

      await client.query(`
        UPDATE subscriptions
        SET status = 'active',
            start_date = $1,
            end_date = $2,
            payment_id = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [startDate, endDate, orderId, payment.subscription_id]);

      // Link payment transaction to subscription
      await client.query(`
        UPDATE payment_transactions
        SET subscription_id = $1
        WHERE id = $2
      `, [payment.subscription_id, payment.id]);

      // Mark onboarding test call as used for this user after successful purchase
      await client.query(
        `
          UPDATE users
          SET onboarding_test_call_used = TRUE
          WHERE id = $1
        `,
        [payment.user_id]
      );
    } else if (!isSuccessful && payment.subscription_id) {
      // Mark subscription as failed
      await client.query(`
        UPDATE subscriptions
        SET status = 'failed',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [payment.subscription_id]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: isSuccessful ? 'Payment processed and subscription activated' : 'Payment failed',
      order_id: orderId
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    console.error('Error processing payment success:', error);
    res.status(500).json({ success: false, error: 'Failed to process payment' });
  } finally {
    if (client) client.release();
  }
});

// Process payment failure - called from frontend redirect API
router.post('/aamarpay/process-fail', express.json(), async (req, res) => {
  let client;
  try {
    const aamarpayResponse = req.body;
    const orderId = aamarpayResponse.mer_txnid || aamarpayResponse.order_id || aamarpayResponse.tran_id;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID not found in response' });
    }

    client = await db.pool.connect();
    await client.query('BEGIN');

    // Find payment transaction
    const paymentResult = await client.query(`
      SELECT pt.*, s.id as subscription_id
      FROM payment_transactions pt
      LEFT JOIN subscriptions s ON pt.subscription_id = s.id
      WHERE pt.order_id = $1
      ORDER BY pt.created_at DESC
      LIMIT 1
    `, [orderId]);

    if (paymentResult.rows.length > 0) {
      const payment = paymentResult.rows[0];
      const transactionId = aamarpayResponse.pg_txnid || aamarpayResponse.epw_txnid || payment.transaction_id;

      // Update payment transaction
      await client.query(`
        UPDATE payment_transactions
        SET transaction_id = $1,
            status = 'failed',
            payment_method = $2,
            gateway_response = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [
        transactionId,
        aamarpayResponse.card_type || 'aamarPay',
        JSON.stringify(aamarpayResponse),
        payment.id
      ]);

      // Mark subscription as failed if exists
      if (payment.subscription_id) {
        await client.query(`
          UPDATE subscriptions
          SET status = 'failed',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [payment.subscription_id]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Payment failure processed', order_id: orderId });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    console.error('Error processing payment failure:', error);
    res.status(500).json({ success: false, error: 'Failed to process payment failure' });
  } finally {
    if (client) client.release();
  }
});

// Process payment cancellation - called from frontend redirect API
router.post('/aamarpay/process-cancel', express.json(), async (req, res) => {
  let client;
  try {
    const aamarpayResponse = req.body;
    const orderId = aamarpayResponse.mer_txnid || aamarpayResponse.order_id || aamarpayResponse.tran_id;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID not found in response' });
    }

    client = await db.pool.connect();
    await client.query('BEGIN');

    // Find payment transaction
    const paymentResult = await client.query(`
      SELECT pt.*, s.id as subscription_id
      FROM payment_transactions pt
      LEFT JOIN subscriptions s ON pt.subscription_id = s.id
      WHERE pt.order_id = $1
      ORDER BY pt.created_at DESC
      LIMIT 1
    `, [orderId]);

    if (paymentResult.rows.length > 0) {
      const payment = paymentResult.rows[0];

      // Update payment transaction
      await client.query(`
        UPDATE payment_transactions
        SET status = 'cancelled',
            gateway_response = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(aamarpayResponse), payment.id]);

      // Mark subscription as cancelled if exists
      if (payment.subscription_id) {
        await client.query(`
          UPDATE subscriptions
          SET status = 'cancelled',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [payment.subscription_id]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Payment cancellation processed', order_id: orderId });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    console.error('Error processing payment cancellation:', error);
    res.status(500).json({ success: false, error: 'Failed to process payment cancellation' });
  } finally {
    if (client) client.release();
  }
});

// Payment success callback (backend webhook - aamarpay may call this)
router.post('/aamarpay/success', express.urlencoded({ extended: true }), (req, res) => {
  const tranId = req.body.tran_id || req.body.order_id || '';
  res.redirect(`${FRONTEND_URL}/payment-success?order_id=${tranId}`);
});

// Payment fail callback (backend webhook - aamarpay may call this)
router.post('/aamarpay/fail', express.urlencoded({ extended: true }), (req, res) => {
  const tranId = req.body.tran_id || req.body.order_id || '';
  res.redirect(`${FRONTEND_URL}/payment-failed?order_id=${tranId}`);
});

// Payment cancel callback (backend webhook - aamarpay may call this)
router.post('/aamarpay/cancel', express.urlencoded({ extended: true }), (req, res) => {
  const tranId = req.body.tran_id || req.body.order_id || '';
  res.redirect(`${FRONTEND_URL}/payment-cancel?order_id=${tranId}`);
});

module.exports = router;
