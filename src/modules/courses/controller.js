/**
 * Courses Module Controller
 * HTTP request handlers for course endpoints
 */

const coursesService = require('./service');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

const coursesController = {
  /**
   * Initialize user course
   */
  async initializeUserCourse(req, res) {
    try {
      const userId = req.user.userId;
      const result = await coursesService.initializeUserCourse(userId);

      return res.status(201).json({
        success: true,
        data: result,
        message: 'Course initialized successfully',
      });
    } catch (error) {
      console.error('Error initializing course:', error);

      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR',
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to initialize course',
        code: 'INTERNAL_ERROR',
      });
    }
  },

  /**
   * Get course status and today's progress (simplified, no batch triggering)
   */
  async getCourseStatus(req, res) {
    try {
      const userId = req.user.userId;
      const result = await coursesService.getCourseStatus(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof NotFoundError && String(error.message).includes('No active course found')) {
        // Expected pre-init state: user has no active course yet.
        console.warn(`No active course for user ${req.user.userId} (expected pre-init state)`);
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'NO_ACTIVE_COURSE',
        });
      }

      if (error instanceof NotFoundError) {
        console.warn('Course status not found:', error.message);
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'NOT_FOUND',
        });
      }

      console.error('Error getting course status:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to get course status',
        code: 'INTERNAL_ERROR',
      });
    }
  },

  /**
   * Check and create next batch generation
   */
  async checkAndCreateNextBatch(req, res) {
    try {
      const userId = req.user.userId;
      const result = await coursesService.checkAndCreateNextBatch(userId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error checking batch creation:', error);

      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'NOT_FOUND',
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to check and create batch',
        code: 'INTERNAL_ERROR',
      });
    }
  },

  /**
   * Get full course timeline (8 weeks) with per-day progress merged from daily_progress
   * GET /api/courses/timeline?date=YYYY-MM-DD
   */
  async getCourseTimeline(req, res) {
    try {
      const userId = req.user.userId;
      const { date } = req.query;
      const result = await coursesService.getCourseTimeline(userId, date);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error getting course timeline:', error);

      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'NOT_FOUND',
        });
      }

      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR',
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to get course timeline',
        code: 'INTERNAL_ERROR',
      });
    }
  },
};

module.exports = coursesController;
