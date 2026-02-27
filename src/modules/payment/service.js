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
const discountTokenService = require('../discount-tokens/service');
const emailService = require('../../core/services/email');
let Payment;
try {
  ({ Payment } = require('aamarpay.v2'));
} catch (e) {
  // Optional dependency; guard if not installed
}

const AAMARPAY_STORE_ID = process.env.AAMARPAY_STORE_ID;
const AAMARPAY_SIGNATURE_KEY = process.env.AAMARPAY_SIGNATURE_KEY;
const AAMARPAY_SANDBOX = 
  String(process.env.AAMARPAY_SANDBOX || 'true').toLowerCase() !== 'false' ||
  String(process.env.AAMARPAY_TEST_MODE || 'false').toLowerCase() === 'true';

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
    endDate.setDate(endDate.getDate() + plan.duration_days);

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

    // Send payment confirmation email
    try {
      const user = await db.queryOne(
        `SELECT email, full_name FROM users WHERE id = $1`,
        [userId]
      );

      if (user && user.email) {
        const emailResult = await emailService.sendPaymentConfirmation(user.email, {
          userName: user.full_name || 'User',
          planName: plan.plan_type || 'Pro',
          amount: transaction.amount,
          transactionId: transactionReference || transaction.transaction_id,
          billingPeriod: `${plan.duration_days} days`,
        });

        if (!emailResult.success) {
          console.error(`[PaymentService] Failed to send payment confirmation email:`, emailResult.error);
        } else {
          console.log(`[PaymentService] Payment confirmation email sent to ${user.email}`);
        }
      }
    } catch (emailError) {
      // Don't fail the payment if email fails
      console.error('[PaymentService] Error sending payment confirmation email:', emailError.message);
    }

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
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    if (!Payment || !AAMARPAY_STORE_ID || !AAMARPAY_SIGNATURE_KEY) {
      throw new Error('AamarPay not configured');
    }

    // Determine actual plan type (may be overridden by discount token)
    let actualPlanType = planType;
    let tokenId = null;
    let originalAmount = null;
    let discountAmount = 0;

    // Validate and apply discount token if provided
    if (payload.discountToken) {
      try {
        const token = await discountTokenService.validateToken(payload.discountToken, userId, planType);
        
        // If token is plan-specific, use that plan type
        if (token.plan_type) {
          actualPlanType = token.plan_type;
        }

        tokenId = token.id;
      } catch (error) {
        throw new ValidationError(error.message || 'Invalid discount token');
      }
    }

    const plan = await db.queryOne(
      `SELECT * FROM subscription_plans WHERE plan_type = $1 AND is_active = true ORDER BY id DESC LIMIT 1`,
      [actualPlanType]
    );
    if (!plan) {
      console.error(`[PaymentService] Plan type "${actualPlanType}" not found in database`);
      throw new Error(`Plan type "${actualPlanType}" not found`);
    }

    console.log(`[PaymentService] Found plan:`, plan);

    const tranId = `TALK_${userId}_${Date.now()}`;
    originalAmount = parseFloat(payload.amount || plan.price_usd || plan.price || 0);
    const currency = payload.currency || 'BDT';

    // Apply discount if token is valid
    let finalAmount = originalAmount;
    if (tokenId) {
      const token = await db.queryOne('SELECT * FROM discount_tokens WHERE id = $1', [tokenId]);
      if (token) {
        // Convert to number (PostgreSQL DECIMAL returns as string)
        const discountResult = discountTokenService.applyDiscount(
          originalAmount, 
          parseFloat(token.discount_percent)
        );
        finalAmount = discountResult.discountedPrice;
        discountAmount = discountResult.discountAmount;
      }
    }

    // Create pending records in a transaction
    console.log(`[PaymentService] Creating pending subscription and transaction for user ${userId}, planId: ${plan.id}, tranId: ${tranId}`);
    let subscriptionId;
    await db.transaction(async (client) => {
      const subRes = await client.query(
        `INSERT INTO subscriptions (user_id, plan_id, status, payment_id, created_at, updated_at)
         VALUES ($1, $2, 'pending', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [userId, plan.id, tranId]
      );
      subscriptionId = subRes.rows[0].id;

      await client.query(
        `INSERT INTO payment_transactions 
         (user_id, subscription_id, transaction_id, order_id, amount, currency, status, discount_token_id, original_amount, discount_amount, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, subscriptionId, tranId, tranId, finalAmount, currency, tokenId, originalAmount, discountAmount]
      );
    });

    const pay = new Payment(AAMARPAY_STORE_ID, AAMARPAY_SIGNATURE_KEY, AAMARPAY_SANDBOX);
    const paymentData = {
      data: {
        amount: String(finalAmount || '0'),
        currency,
        cus_email: payload.cus_email || 'user@example.com',
        cus_name: payload.cus_name || 'Talktivity User',
        cus_phone: payload.cus_phone || '01XXXXXXXX',
        desc: payload.desc || `Talktivity ${actualPlanType} Plan Subscription`,
        tran_id: tranId,
        cus_add1: payload.cus_add1 || 'N/A',
      },
      cancel_url: payload.cancel_url,
      fail_url: payload.fail_url,
      success_url: payload.success_url,
    };

    const paymentUrl = await pay.init(paymentData);
    console.log(`[PaymentService] AamarPay payment initialized successfully. Order ID: ${tranId}, URL: ${paymentUrl}`);
    return { 
      payment_url: paymentUrl, 
      order_id: tranId,
      original_amount: originalAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount
    };
  },

  /**
   * AamarPay: Process success/fail/cancel callbacks
   */
  async processAamarPayResult(aamarpayResponse, outcome) {
    const rawOrderId =
      aamarpayResponse.mer_txnid ||
      aamarpayResponse.order_id ||
      aamarpayResponse.tran_id;

    console.log(`[PaymentService] Processing AamarPay result. Outcome: ${outcome}, Raw Order ID: ${rawOrderId}`);

    if (!rawOrderId) {
      console.error('AamarPay callback missing orderId-like field', {
        outcome,
        keys: Object.keys(aamarpayResponse || {}),
      });
      throw new Error('Order ID not found in response');
    }

    const orderId = String(rawOrderId);

    let paymentResult = await db.queryOne(
      `SELECT pt.*, s.id as subscription_id, s.plan_id, sp.duration_days
       FROM payment_transactions pt
       LEFT JOIN subscriptions s ON pt.subscription_id = s.id
       LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE pt.order_id = $1
       ORDER BY pt.created_at DESC
       LIMIT 1`,
      [orderId]
    );

    if (!paymentResult && aamarpayResponse.tran_id) {
      const tranId = String(aamarpayResponse.tran_id);
      paymentResult = await db.queryOne(
        `SELECT pt.*, s.id as subscription_id, s.plan_id, sp.duration_days
         FROM payment_transactions pt
         LEFT JOIN subscriptions s ON pt.subscription_id = s.id
         LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
         WHERE pt.transaction_id = $1
         ORDER BY pt.created_at DESC
         LIMIT 1`,
        [tranId]
      );
    }

    if (!paymentResult) {
      console.error('[PaymentService] AamarPay callback: matching payment transaction not found in database', {
        outcome,
        orderId,
        keys: Object.keys(aamarpayResponse || {}),
        pg_txnid: aamarpayResponse?.pg_txnid,
        epw_txnid: aamarpayResponse?.epw_txnid,
        tran_id: aamarpayResponse?.tran_id,
        mer_txnid: aamarpayResponse?.mer_txnid,
      });
      throw new Error('Payment transaction not found');
    }

    console.log(`[PaymentService] Found payment transaction record:`, paymentResult);

    // Finalize core payment + subscription changes inside a single transaction
    await this.finalizeAamarPayTransaction(paymentResult, aamarpayResponse, outcome, orderId);

    // Record discount token usage outside the main transaction so lock/timeout
    // issues on discount tables never roll back the payment/subscription updates.
    if (outcome === 'success') {
      await this.recordAamarPayDiscountUsage(paymentResult);
    }

    // On success, also mark upgrade as completed in lifecycle
    if (outcome === 'success' && paymentResult.user_id) {
      try {
        const lifecycleService = require('../user-lifecycle/service');
        await lifecycleService.updateLifecycleState(paymentResult.user_id, { upgrade_completed: true });
      } catch (e) {
        // Log and continue; subscription is already active
        console.error(
          'Error updating lifecycle upgrade_completed for AamarPay success',
          { userId: paymentResult.user_id, orderId },
          e
        );
      }
    }

    return { success: true, order_id: orderId, outcome };
  },

  /**
   * Internal helper to finalize an AamarPay transaction:
   * - updates payment_transactions
   * - updates subscriptions
   */
  async finalizeAamarPayTransaction(paymentResult, aamarpayResponse, outcome, orderId) {
    const transactionId =
      aamarpayResponse.pg_txnid ||
      aamarpayResponse.epw_txnid ||
      paymentResult.transaction_id;
    const method = aamarpayResponse.card_type || 'aamarPay';
    const gatewayResp = JSON.stringify(aamarpayResponse);

    console.log(`[PaymentService] Finalizing AamarPay transaction. Order ID: ${orderId}, Outcome: ${outcome}, Status will be updated for payment ID: ${paymentResult.id}`);

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
          outcome === 'success' ? 'completed' : outcome === 'fail' ? 'failed' : 'cancelled',
          method,
          gatewayResp,
          paymentResult.id,
        ]
      );

      if (paymentResult.subscription_id) {
        if (outcome === 'success') {
          const startDate = new Date();
          const days = paymentResult.duration_days || 60;
          const endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + days);

          console.log(`[PaymentService] Success: Activating subscription ${paymentResult.subscription_id}. Free Trial reset to false. Expiry: ${endDate}`);

          await client.query(
            `UPDATE subscriptions
             SET status = 'active',
                 start_date = $1,
                 end_date = $2,
                 payment_id = $3,
                 is_free_trial = false,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [startDate, endDate, orderId, paymentResult.subscription_id]
          );

          // Expire any other currently active subscriptions for the user
          console.log(`[PaymentService] Success: Expiring any other active subscriptions for user ${paymentResult.user_id} to ensure plan exclusivity.`);
          await client.query(
            `UPDATE subscriptions 
             SET status = 'expired', 
                 updated_at = CURRENT_TIMESTAMP 
             WHERE user_id = $1 AND id != $2 AND status = 'active'`,
            [paymentResult.user_id, paymentResult.subscription_id]
          );

        } else if (outcome === 'fail') {
          console.log(`[PaymentService] Failure: Marking subscription ${paymentResult.subscription_id} as pending due to payment failure`);
          // Keep subscription as 'pending' on failure (constraint allows: pending, active, expired, cancelled)
          // The subscription can be retried later
          await client.query(
            `UPDATE subscriptions SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [paymentResult.subscription_id]
          );
        } else if (outcome === 'cancel') {
          console.log(`[PaymentService] Cancelled: Marking subscription ${paymentResult.subscription_id} as cancelled`);
          await client.query(
            `UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [paymentResult.subscription_id]
          );
        }
      } else {
        console.warn('AamarPay callback without subscription_id on payment', {
          outcome,
          orderId,
          userId: paymentResult.user_id,
          paymentId: paymentResult.id,
        });
      }
    });
  },

  /**
   * Record discount token usage after payment is finalized.
   * Runs outside the main payment transaction so failures/timeouts
   * here never roll back the core payment/subscription updates.
   */
  async recordAamarPayDiscountUsage(paymentResult) {
    if (!paymentResult.discount_token_id || !paymentResult.original_amount || !paymentResult.discount_amount) {
      return;
    }

    try {
      await discountTokenService.recordTokenUsage(
        paymentResult.discount_token_id,
        paymentResult.user_id,
        paymentResult.subscription_id,
        parseFloat(paymentResult.discount_amount),
        parseFloat(paymentResult.original_amount)
      );

      // Check if max_users limit is reached after recording usage
      const token = await db.queryOne(
        'SELECT max_users FROM discount_tokens WHERE id = $1',
        [paymentResult.discount_token_id]
      );

      if (token && token.max_users !== null) {
        const uniqueUserCount = await discountTokenService.getTokenUniqueUserCount(paymentResult.discount_token_id);
        if (uniqueUserCount >= token.max_users) {
          await db.queryOne(
            'UPDATE discount_tokens SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [paymentResult.discount_token_id]
          );
        }
      }
    } catch (error) {
      // Log but never fail the payment flow
      console.error('Error recording discount token usage:', error);
    }
  },
};

module.exports = paymentService;
