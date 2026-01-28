/**
 * Vocabulary Module Controller
 * Handles HTTP requests for vocabulary endpoints
 */

const { sendSuccess } = require('../../core/http/response');
const vocabularyService = require('./service');

const vocabularyController = {
  /**
   * GET /api/vocabulary/words
   * Get vocabulary words for user's current course week/day
   * Query params: week (optional), day (optional)
   * If week/day not provided, uses course's current week/day
   */
  async getWordsForDay(req, res, next) {
    try {
      const userId = req.user.userId;
      const { week, day } = req.query;
      
      // Convert string query params to numbers if provided
      const weekNum = week ? parseInt(week, 10) : null;
      const dayNum = day ? parseInt(day, 10) : null;
      
      const data = await vocabularyService.getWordsForUserWeekDay(userId, weekNum, dayNum);
      sendSuccess(res, data, 200, 'Vocabulary words retrieved successfully');
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/vocabulary/complete
   * Mark vocabulary as completed for user's current course week/day
   * Body: { week (optional), day (optional) }
   * If week/day not provided, uses course's current week/day
   */
  async markDayComplete(req, res, next) {
    try {
      const userId = req.user.userId;
      const { week, day } = req.body;
      
      // Convert to numbers if provided
      const weekNum = week ? parseInt(week, 10) : null;
      const dayNum = day ? parseInt(day, 10) : null;
      
      const result = await vocabularyService.markVocabularyComplete(userId, weekNum, dayNum);
      sendSuccess(res, result, 200, 'Vocabulary marked as completed successfully');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = vocabularyController;
