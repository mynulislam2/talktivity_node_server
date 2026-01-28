/**
 * Subscriptions Module Controller
 */

const { sendSuccess, sendError } = require('../../core/http/response');
const subscriptionsService = require('./service');

const subscriptionsController = {
  async getPlans(req, res, next) {
    try {
      const plans = await subscriptionsService.getAllPlans();
      sendSuccess(res, plans, 200, 'Plans retrieved successfully');
    } catch (error) {
      next(error);
    }
  },

  async getSubscriptionStatus(req, res, next) {
    try {
      const userId = req.user.userId;
      const status = await subscriptionsService.getUserSubscriptionStatus(userId);
      sendSuccess(res, status, 200, 'Subscription status retrieved');
    } catch (error) {
      next(error);
    }
  },

  async startFreeTrial(req, res, next) {
    try {
      const userId = req.user.userId;
      const subscription = await subscriptionsService.activateFreeTrial(userId);
      sendSuccess(res, subscription, 201, 'Free trial activated');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = subscriptionsController;
