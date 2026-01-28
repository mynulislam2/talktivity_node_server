/**
 * Subscriptions Module Repository
 */

const db = require('../../core/db/client');

const subscriptionsRepo = {
  async getSubscriptionById(subscriptionId) {
    return await db.queryOne(
      `SELECT * FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    );
  },

  async getUserActiveSubscription(userId) {
    return await db.queryOne(
      `SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
  },

  async updateSubscription(subscriptionId, data) {
    const { status, endDate } = data;
    return await db.queryOne(
      `UPDATE subscriptions SET status = $1, end_date = $2 WHERE id = $3
       RETURNING *`,
      [status, endDate, subscriptionId]
    );
  },
};

module.exports = subscriptionsRepo;
