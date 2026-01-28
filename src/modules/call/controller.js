/**
 * Call Module Controller
 * HTTP handlers for call session management
 */

const callService = require('./service');
const { sendSuccess, sendError } = require('../../core/http/response');

const callController = {
  /**
   * GET /api/call/status
   * Get call session status and statistics for the user
   */
  async getCallStatus(req, res, next) {
    try {
      const userId = req.user.userId;
      const status = await callService.getCallStatus(userId);
      return sendSuccess(res, status);
    } catch (error) {
      return next(error);
    }
  },

  /**
   * GET /api/call/check-eligibility
   * Check if user can start a call (for connection details API)
   */
  async checkEligibility(req, res, next) {
    try {
      const userId = req.user.userId;
      const canCall = await callService.canStartCall(userId);
      return sendSuccess(res, { canCall });
    } catch (error) {
      return next(error);
    }
  },
};

module.exports = callController;
