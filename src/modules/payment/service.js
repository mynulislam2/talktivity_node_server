/**
 * Payment Module Service - POSTMAN ALIGNED
 * Extracted from routes/secure-payment-routes.js and routes/aamarpay-routes.js
 * Handles payment processing and subscription management
 * 
 * Removed orphaned methods: logPaymentEvent(), getPlanDetails(),
 * initiatePayment(), processPaymentSuccess(), getSubscriptionStatus() (legacy),
 * getPaymentHistory() (legacy), getTransactionByReference(), getPaymentAuditLog(),
 * refundSubscription(), getPaymentHistoryForUser(), getSubscriptionStatusLegacy()
 */

const db = require('../../core/db/client');
const { ValidationError, NotFoundError } = require('../../core/error/errors');
let Payment;
try {
  ({ Payment } = require('aamarpay.v2'));
} catch (e) {
  // Optional dependency; guard if not installed
}

const AAMARPAY_STORE_ID = process.env.AAMARPAY_STORE_ID;
const AAMARPAY_SIGNATURE_KEY = process.env.AAMARPAY_SIGNATURE_KEY;
const AAMARPAY_SANDBOX = String(process.env.AAMARPAY_SANDBOX || 'true').toLowerCase() !== 'false';

const paymentService = {
  // ============ POSTMAN-ALIGNED METHODS ============

  /**
   * Rate limiting for payment attempts
   */
  paymentAttempts: new Map(),

  checkRateLimit(userId) {
    const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
    const MAX_ATTEMPTS = 5;
    const now = Date.now();

    const userAttempts = this.paymentAttempts.get(userId) || [];
    const recentAttempts = userAttempts.filter(time => now - time < RATE_LIMIT_WINDOW);

    if (recentAttempts.length >= MAX_ATTEMPTS) {
      return false;
    }

    recentAttempts.push(now);
    this.paymentAttempts.set(userId, recentAttempts);
    return true;
  },

  /**
   * Create payment request
   */
  async createPaymentRequest(userId, planType, ipAddress, userAgent) {
    // Get plan
    const plan = await this.getPlanDetails(planType);
    if (!plan) {
      throw new Error('Plan not found');
    }

    // Create payment record
    const payment = await this.initiatePayment(userId, plan.id, plan.price);

    // Log event
    await this.logPaymentEvent('payment_created', userId, {
      planType,
      amount: plan.price,
      planId: plan.id
    }, ipAddress, userAgent);

    return payment;
  },

  /**
   * Process payment success
   */
  async processPaymentSuccess(transactionId, transactionReference, userId) {
    // Update payment transaction
    const transaction = await db.queryOne(
      `UPDATE payment_transactions SET status = 'completed', transaction_reference = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [transactionId, transactionReference]
    );

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Get plan from transaction
    const plan = await db.queryOne(
      `SELECT sp.* FROM subscription_plans sp
       WHERE sp.id = $1`,
      [transaction.plan_id]
    );

    // Create or update subscription
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.billing_cycle_days);

    const subscription = await db.queryOne(
      `INSERT INTO subscriptions (user_id, plan_id, status, start_date, end_date, payment_id, created_at, updated_at)
       VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET 
       plan_id = $2, status = 'active', end_date = $3, payment_id = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, transaction.plan_id, endDate, transactionId]
    );

    // Update lifecycle: mark upgrade as completed
    const lifecycleService = require('../user-lifecycle/service');
    await lifecycleService.updateLifecycleState(userId, { upgrade_completed: true });

    return { transaction, subscription };
  },

  /**
   * Verify payment webhook
   */
  async verifyPaymentWebhook(transactionId, paymentStatus) {
    const transaction = await db.queryOne(
      `SELECT * FROM payment_transactions WHERE transaction_id = $1`,
      [transactionId]
    );

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (paymentStatus === 'success') {
      return await this.processPaymentSuccess(transaction.id, transactionId, transaction.user_id);
    } else if (paymentStatus === 'failed') {
      await db.queryOne(
        `UPDATE payment_transactions SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [transaction.id]
      );
    }

    return transaction;
  },

  /**
   * AamarPay: Create payment and return payment URL
   */
  async createAamarPayPayment(userId, planType, payload) {
    if (!Payment || !AAMARPAY_STORE_ID || !AAMARPAY_SIGNATURE_KEY) {
      throw new Error('AamarPay not configured');
    }

    const plan = await db.queryOne(
      `SELECT * FROM subscription_plans WHERE plan_type = $1 AND is_active = true ORDER BY id DESC LIMIT 1`,
      [planType]
    );
    if (!plan) {
      throw new Error(`Plan type "${planType}" not found`);
    }

    const tranId = `TALK_${userId}_${Date.now()}`;
    const amount = parseFloat(payload.amount || plan.price_usd || 0);
    const currency = payload.currency || 'BDT';

    // Create pending records in a transaction
    await db.transaction(async (client) => {
      const subRes = await client.query(
        `INSERT INTO subscriptions (user_id, plan_id, status, payment_id, created_at, updated_at)
         VALUES ($1, $2, 'pending', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [userId, plan.id, tranId]
      );
      const subscriptionId = subRes.rows[0].id;

      await client.query(
        `INSERT INTO payment_transactions (user_id, subscription_id, transaction_id, order_id, amount, currency, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, subscriptionId, tranId, tranId, amount, currency]
      );
    });

    const pay = new Payment(AAMARPAY_STORE_ID, AAMARPAY_SIGNATURE_KEY, AAMARPAY_SANDBOX);
    const paymentData = {
      data: {
        amount: String(amount || '0'),
        currency,
        cus_email: payload.cus_email || 'user@example.com',
        cus_name: payload.cus_name || 'Talktivity User',
        cus_phone: payload.cus_phone || '01XXXXXXXX',
        desc: payload.desc || `Talktivity ${planType} Plan Subscription`,
        tran_id: tranId,
        cus_add1: payload.cus_add1 || 'N/A',
      },
      cancel_url: payload.cancel_url,
      fail_url: payload.fail_url,
      success_url: payload.success_url,
    };

    const paymentUrl = await pay.init(paymentData);
    return { payment_url: paymentUrl, order_id: tranId };
  },

  /**
   * AamarPay: Process success/fail/cancel callbacks
   */
  async processAamarPayResult(aamarpayResponse, outcome) {
    const orderId = aamarpayResponse.mer_txnid || aamarpayResponse.order_id || aamarpayResponse.tran_id;
    if (!orderId) throw new Error('Order ID not found in response');

    const paymentResult = await db.queryOne(
      `SELECT pt.*, s.id as subscription_id, s.plan_id, sp.duration_days, sp.billing_cycle_days
       FROM payment_transactions pt
       LEFT JOIN subscriptions s ON pt.subscription_id = s.id
       LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE pt.order_id = $1
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [orderId]
    );

    if (!paymentResult) {
      throw new Error('Payment transaction not found');
    }

    const transactionId = aamarpayResponse.pg_txnid || aamarpayResponse.epw_txnid || paymentResult.transaction_id;
    const method = aamarpayResponse.card_type || 'aamarPay';
    const gatewayResp = JSON.stringify(aamarpayResponse);

    await db.transaction(async (client) => {
      // Update payment transaction
      await client.query(
        `UPDATE payment_transactions
         SET transaction_id = $1,
             status = $2,
             payment_method = $3,
             gateway_response = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          transactionId,
          outcome === 'success' ? 'success' : outcome === 'fail' ? 'failed' : 'cancelled',
          method,
          gatewayResp,
          paymentResult.id,
        ]
      );

      if (paymentResult.subscription_id) {
        if (outcome === 'success') {
          const startDate = new Date();
          const days = paymentResult.duration_days || paymentResult.billing_cycle_days || 60;
          const endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + days);

          await client.query(
            `UPDATE subscriptions
             SET status = 'active',
                 start_date = $1,
                 end_date = $2,
                 payment_id = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [startDate, endDate, orderId, paymentResult.subscription_id]
          );
        } else if (outcome === 'fail') {
          await client.query(
            `UPDATE subscriptions SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [paymentResult.subscription_id]
          );
        } else if (outcome === 'cancel') {
          await client.query(
            `UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [paymentResult.subscription_id]
          );
        }
      }
    });

    // On success, also mark upgrade as completed in lifecycle
    if (outcome === 'success' && paymentResult.user_id) {
      try {
        const lifecycleService = require('../user-lifecycle/service');
        await lifecycleService.updateLifecycleState(paymentResult.user_id, { upgrade_completed: true });
      } catch (e) {
        // Log and continue; subscription is already active
        console.error('Error updating lifecycle upgrade_completed for AamarPay success:', e);
      }
    }

    return { success: true, order_id: orderId, outcome };
  },
};

module.exports = paymentService;
