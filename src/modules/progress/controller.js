/**
 * Progress Module Controller
 */

const { sendSuccess, sendError } = require('../../core/http/response');
const progressService = require('./service');
const { ValidationError } = require('../../core/error/errors');

const progressController = {
  async getDailyProgress(req, res, next) {
    try {
      const userId = req.user.userId;
      const { date } = req.query;
      const progress = await progressService.getDailyProgress(userId, date);
      sendSuccess(res, progress, 200, 'Daily progress retrieved');
    } catch (error) {
      next(error);
    }
  },

  async upsertDailyProgress(req, res, next) {
    try {
      const userId = req.user.userId;
      if (!req.body || typeof req.body !== 'object') {
        throw new ValidationError('Invalid request body', 'body');
      }
      const { date, ...payload } = req.body;
      const updated = await progressService.upsertDailyProgress(userId, date, payload);
      sendSuccess(res, updated, 200, 'Daily progress saved');
    } catch (error) {
      next(error);
    }
  },

  async getProgressOverview(req, res, next) {
    try {
      const userId = req.user.userId;
      const overview = await progressService.getProgressOverview(userId);
      
      if (!overview) {
        return sendError(res, 'No active course found', 404);
      }

      sendSuccess(res, overview, 200, 'Progress overview retrieved');
    } catch (error) {
      next(error);
    }
  },

  async completeWeeklyExam(req, res, next) {
    try {
      const userId = req.user.userId;
      const { date } = req.body || {};
      const result = await progressService.completeWeeklyExam(userId, date);
      sendSuccess(res, result, 200, 'Weekly exam completed');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = progressController;
