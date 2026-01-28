/**
 * Onboarding Module Controller
 */

const onboardingService = require('./service');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

const onboardingController = {
  /**
   * POST /onboarding - Save or update onboarding data
   */
  async saveOnboarding(req, res) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await onboardingService.saveOrUpdateOnboarding(userId, req.body);
      
      res.status(201).json({
        success: true,
        message: 'Onboarding data saved successfully',
        data: result
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }
      
      console.error('Error saving onboarding data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save onboarding data'
      });
    }
  },

  // Removed getOnboardingData. Use lifecycle API for onboarding and lifecycle details.
};

module.exports = onboardingController;
