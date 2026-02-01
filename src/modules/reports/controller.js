/**
 * Reports Module Controller (Postman-aligned)
 */

const reportsService = require('./service');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

const reportsController = {
  /**
   * GET /api/reports/daily?date=YYYY-MM-DD
   * Service automatically fetches cached report or generates if not found
   */
  async getDailyReport(req, res) {
    try {
      const userId = req.user?.userId;
      const date = req.query.date || new Date().toISOString().split('T')[0];

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      // Service automatically fetches or generates
      const result = await reportsService.getDailyReport(userId, date);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('[Reports] Error in getDailyReport:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Unable to retrieve daily report' 
      });
    }
  },

  /**
   * GET /api/reports/call
   * Generates a comprehensive report from ALL user conversations
   * Collects all conversations, sends to Groq for analysis, validates response structure
   */
  async generateCallReport(req, res, next) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      console.log(`[Reports] Generating call report for user ${userId}`);
      const report = await reportsService.generateCallReport(userId);
      console.log(`[Reports] Successfully generated report for user ${userId}`);
      return res.json({ success: true, data: report });
    } catch (error) {
      console.error(`[Reports] Error generating call report for user ${req.user?.userId}:`, error);
      if (error instanceof ValidationError) {
        return res.status(400).json({ 
          success: false, 
          error: error.message,
          code: 'VALIDATION_ERROR'
        });
      }
      // Log full error for debugging
      console.error('[Reports] Full error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      next(error);
    }
  },
};

module.exports = reportsController;
