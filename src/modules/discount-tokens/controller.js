/**
 * Discount Tokens Module Controller
 */

const { sendSuccess } = require('../../core/http/response');
const { ValidationError } = require('../../core/error/errors');
const db = require('../../core/db/client');
const discountTokenService = require('./service');

const discountTokensController = {
  /**
   * Validate token and return discount information
   * POST /api/discount-tokens/validate
   */
  async validateToken(req, res, next) {
    try {
      const userId = req.user?.userId;
      const { tokenCode, planType } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      if (!tokenCode || !planType) {
        return res.status(400).json({ 
          success: false, 
          error: 'Token code and plan type are required' 
        });
      }

      // Validate token
      const token = await discountTokenService.validateToken(tokenCode, userId, planType);

      // Get plan price from subscription_plans table
      const plan = await db.queryOne(
        `SELECT * FROM subscription_plans WHERE plan_type = $1 AND is_active = true ORDER BY id DESC LIMIT 1`,
        [planType]
      );

      if (!plan) {
        throw new ValidationError(`Plan type "${planType}" not found`);
      }

      const originalPrice = parseFloat(plan.price_usd || plan.price || 0);

      // Calculate discount
      const discountResult = discountTokenService.applyDiscount(originalPrice, token.discount_percent);

      sendSuccess(res, discountResult, 200, 'Token validated successfully');
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, error: error.message });
      }
      next(error);
    }
  },
};

module.exports = discountTokensController;
