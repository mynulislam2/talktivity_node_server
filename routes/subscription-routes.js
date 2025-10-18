const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/subscription/status/:userId
router.get('/subscription/status/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid userId' });
    }

    // Check for active subscription in the new subscriptions table
    const { rows } = await db.pool.query(`
      SELECT s.*, p.plan_type, p.features, p.price
      FROM subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);

    if (rows.length > 0) {
      const subscription = rows[0];
      return res.status(200).json({ 
        success: true, 
        data: { 
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
            free_trial_started_at: subscription.free_trial_started_at,
            free_trial_used: subscription.free_trial_used,
            plan_type: subscription.plan_type,
            features: subscription.features,
            price: subscription.price
          }
        } 
      });
    } else {
      return res.status(200).json({ 
        success: true, 
        data: { 
          active: false,
          subscription: null
        } 
      });
    }
  } catch (error) {
    console.error('Subscription status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch subscription status' });
  }
});

module.exports = router;



