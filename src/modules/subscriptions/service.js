/**
 * Subscriptions Module Service
 * Extracted from routes/subscription-routes.js
 */

const db = require('../../core/db/client');
const { ConflictError, NotFoundError } = require('../../core/error/errors');

const subscriptionsService = {
  /**
   * Get all available subscription plans
   * Deduplicates by plan_type, keeping the most recent entry for each plan type
   */
  async getAllPlans() {
    return await db.queryAll(
      `SELECT DISTINCT ON (plan_type) 
         id, plan_type, talk_time_minutes, features, price, created_at 
       FROM subscription_plans 
       ORDER BY plan_type, id DESC`
    );
  },

  /**
   * Get user's active subscription with plan details
   */
  async getUserSubscriptionStatus(userId) {
    const subscription = await db.queryOne(
      `SELECT s.*, p.plan_type, p.talk_time_minutes, p.features, p.price
       FROM subscriptions s
       LEFT JOIN subscription_plans p ON s.plan_id = p.id
       WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId]
    );

    // Check if user has ever used a free trial
    const hasUsedFreeTrial = await db.queryOne(
      `SELECT id FROM subscriptions WHERE user_id = $1 AND is_free_trial = true LIMIT 1`,
      [userId]
    );

    // User can start free trial if they don't have an active subscription AND haven't used free trial before
    const canStartFreeTrial = !subscription && !hasUsedFreeTrial;

    console.log(`[SubscriptionsService] Status for user ${userId}: active=${!!subscription}, canStartFreeTrial=${canStartFreeTrial}`);

    if (subscription) {
      return {
        active: true,
        subscription: {
          id: subscription.id,
          user_id: subscription.user_id,
          plan_id: subscription.plan_id,
          status: subscription.status,
          start_date: subscription.start_date,
          end_date: subscription.end_date,
          payment_id: subscription.payment_id,
          created_at: subscription.created_at,
          updated_at: subscription.updated_at,
          is_free_trial: subscription.is_free_trial,
          plan_type: subscription.plan_type,
          talk_time_minutes: subscription.talk_time_minutes,
          features: subscription.features,
          price: subscription.price,
        },
        canStartFreeTrial: false, // Can't start if already has active subscription
      };
    }

    return {
      active: false,
      subscription: null,
      canStartFreeTrial: canStartFreeTrial,
    };
  },

  /**
   * Activate free trial for a user (7 days)
   */
  async activateFreeTrial(userId) {
    // Check if user already used free trial
    const existingTrial = await db.queryOne(
      `SELECT id FROM subscriptions WHERE user_id = $1 AND is_free_trial = true`,
      [userId]
    );

    if (existingTrial) {
      throw new ConflictError('Free trial already used');
    }

    // Get free trial plan - check for FreeTrial (camelCase) or Basic plan
    const freetPlan = await db.queryOne(
      `SELECT id FROM subscription_plans WHERE plan_type = 'FreeTrial' OR plan_type = 'Basic' ORDER BY CASE WHEN plan_type = 'FreeTrial' THEN 1 ELSE 2 END LIMIT 1`
    );

    if (!freetPlan) {
      throw new NotFoundError('Free trial plan not found');
    }

    // Calculate 3 day expiry
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 3);

    console.log(`[SubscriptionsService] Activating 3-day free trial for user ${userId}. Plan ID: ${freetPlan.id}, Expiry: ${endDate}`);

    const subscription = await db.queryOne(
      `INSERT INTO subscriptions (user_id, plan_id, status, is_free_trial, start_date, end_date, created_at, updated_at)
       VALUES ($1, $2, 'active', true, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, user_id, plan_id, status, is_free_trial, start_date, end_date`,
      [userId, freetPlan.id, startDate, endDate]
    );

    // Update lifecycle: mark upgrade as completed (free trial counts as upgrade)
    const lifecycleService = require('../user-lifecycle/service');
    await lifecycleService.updateLifecycleState(userId, { upgrade_completed: true });

    return subscription;
  },

  /**
   * Create a new subscription after payment
   */
  async createSubscription(userId, planId, paymentId, startDate, endDate) {
    return await db.queryOne(
      `INSERT INTO subscriptions (user_id, plan_id, payment_id, status, start_date, end_date, is_free_trial, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $5, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [userId, planId, paymentId, startDate, endDate]
    );
  },

  /**
   * Update existing subscription
   */
  async updateSubscription(subscriptionId, updates) {
    const { status, endDate, planId } = updates;

    return await db.queryOne(
      `UPDATE subscriptions 
       SET status = COALESCE($1, status),
           end_date = COALESCE($2, end_date),
           plan_id = COALESCE($3, plan_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, endDate, planId, subscriptionId]
    );
  },

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription(userId) {
    const subscription = await db.queryOne(
      `SELECT id FROM subscriptions 
       WHERE user_id = $1 AND status = 'active' AND end_date > NOW()
       LIMIT 1`,
      [userId]
    );

    return !!subscription;
  },

  /**
   * Get subscription by ID
   */
  async getSubscriptionById(subscriptionId) {
    return await db.queryOne(
      `SELECT s.*, p.plan_type, p.talk_time_minutes
       FROM subscriptions s
       LEFT JOIN subscription_plans p ON s.plan_id = p.id
       WHERE s.id = $1`,
      [subscriptionId]
    );
  },
};

module.exports = subscriptionsService;
