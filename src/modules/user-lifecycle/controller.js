/**
 * User Lifecycle Module Controller
 * HTTP handlers for lifecycle state management
 */

const lifecycleService = require('./service');
const { sendSuccess, sendError } = require('../../core/http/response');

const lifecycleController = {
  /**
   * GET /api/lifecycle
   * Get complete user lifecycle state
   */
  async getLifecycle(req, res, next) {
    try {
      const userId = req.user.userId;
      const lifecycle = await lifecycleService.getLifecycleState(userId);
      return sendSuccess(res, lifecycle);
    } catch (error) {
      return next(error);
    }
  },

  /**
   * POST /api/lifecycle
   * Update user lifecycle fields (flexible update)
   */
  async updateLifecycle(req, res, next) {
    try {
      const userId = req.user.userId;
      const updates = req.body;

      const lifecycle = await lifecycleService.updateLifecycleState(userId, updates);
      return sendSuccess(res, lifecycle);
    } catch (error) {
      return next(error);
    }
  },
};

module.exports = lifecycleController;
