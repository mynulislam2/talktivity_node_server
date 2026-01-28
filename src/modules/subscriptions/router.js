/**
 * Subscriptions Module Router
 * GET /api/subscriptions/plans
 * GET /api/subscriptions/status
 * POST /api/subscriptions/start-free-trial
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const subscriptionsController = require('./controller');

// Public: Get available subscription plans
router.get('/plans', subscriptionsController.getPlans);

// Protected: Get user's subscription status
router.get('/status', authenticateToken, subscriptionsController.getSubscriptionStatus);

// Protected: Start free trial
router.post('/start-free-trial', authenticateToken, subscriptionsController.startFreeTrial);

module.exports = router;
