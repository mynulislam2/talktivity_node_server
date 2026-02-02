/**
 * Discount Tokens Module Service
 * Handles discount token validation and application
 */

const db = require('../../core/db/client');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

const discountTokenService = {
  /**
   * Validate token eligibility for a user and plan
   * @param {string} tokenCode - The token code to validate
   * @param {number} userId - User ID
   * @param {string} planType - Plan type (Basic, Pro, etc.)
   * @returns {Object} Token data if valid
   */
  async validateToken(tokenCode, userId, planType) {
    if (!tokenCode || !userId || !planType) {
      throw new ValidationError('Token code, user ID, and plan type are required');
    }

    // Normalize token code (uppercase, trim)
    const normalizedCode = tokenCode.toUpperCase().trim();

    // Get token
    const token = await db.queryOne(
      `SELECT * FROM discount_tokens 
       WHERE UPPER(TRIM(token_code)) = $1 AND is_active = true`,
      [normalizedCode]
    );

    if (!token) {
      throw new NotFoundError('Invalid or inactive discount token');
    }

    // Check expiry
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      throw new ValidationError('This discount token has expired');
    }

    // Check plan type match
    if (token.plan_type && token.plan_type !== planType) {
      throw new ValidationError(`This token is only valid for ${token.plan_type} plan`);
    }

    // Check max uses (total usage count)
    if (token.max_uses !== null) {
      const usageCount = await db.queryOne(
        `SELECT COUNT(*) as count FROM discount_token_usage WHERE token_id = $1`,
        [token.id]
      );
      const count = parseInt(usageCount?.count || 0);
      if (count >= token.max_uses) {
        throw new ValidationError('This discount token has reached its maximum usage limit');
      }
    }

    // Check max users (unique user count)
    if (token.max_users !== null) {
      const uniqueUsersCount = await db.queryOne(
        `SELECT COUNT(DISTINCT user_id) as count FROM discount_token_usage WHERE token_id = $1`,
        [token.id]
      );
      const uniqueCount = parseInt(uniqueUsersCount?.count || 0);
      if (uniqueCount >= token.max_users) {
        // Auto-deactivate token when max_users limit is reached
        await db.queryOne(
          `UPDATE discount_tokens SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [token.id]
        );
        throw new ValidationError('This discount token has reached its maximum user limit and is no longer available');
      }
    }

    // Check if user has already used this token
    const existingUsage = await db.queryOne(
      `SELECT id FROM discount_token_usage 
       WHERE token_id = $1 AND user_id = $2`,
      [token.id, userId]
    );

    if (existingUsage) {
      throw new ValidationError('You have already used this discount token');
    }

    return token;
  },

  /**
   * Apply discount to a price
   * @param {number} originalPrice - Original price
   * @param {number|string} discountPercent - Discount percentage (may be string from PostgreSQL DECIMAL)
   * @returns {Object} Discounted price and discount amount
   */
  applyDiscount(originalPrice, discountPercent) {
    // Convert to number (PostgreSQL DECIMAL returns as string)
    const discountPercentNum = parseFloat(discountPercent);
    if (isNaN(discountPercentNum)) {
      throw new ValidationError('Invalid discount percentage');
    }
    
    const discountAmount = (originalPrice * discountPercentNum) / 100;
    const discountedPrice = Math.max(0, originalPrice - discountAmount);
    
    return {
      originalPrice: parseFloat(originalPrice.toFixed(2)),
      discountPercent: parseFloat(discountPercentNum.toFixed(2)), // Now safe to call toFixed
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      discountedPrice: parseFloat(discountedPrice.toFixed(2))
    };
  },

  /**
   * Record token usage
   * @param {number} tokenId - Token ID
   * @param {number} userId - User ID
   * @param {number} subscriptionId - Subscription ID (optional)
   * @param {number} discountAmount - Discount amount applied
   * @param {number} originalAmount - Original price before discount
   */
  async recordTokenUsage(tokenId, userId, subscriptionId, discountAmount, originalAmount) {
    await db.queryOne(
      `INSERT INTO discount_token_usage 
       (token_id, user_id, subscription_id, discount_amount, original_amount, used_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [tokenId, userId, subscriptionId, discountAmount, originalAmount]
    );
  },

  /**
   * Get token usage count
   * @param {number} tokenId - Token ID
   * @returns {number} Usage count
   */
  async getTokenUsageCount(tokenId) {
    const result = await db.queryOne(
      `SELECT COUNT(*) as count FROM discount_token_usage WHERE token_id = $1`,
      [tokenId]
    );
    return parseInt(result?.count || 0);
  },

  /**
   * Get unique user count for a token
   * @param {number} tokenId - Token ID
   * @returns {number} Unique user count
   */
  async getTokenUniqueUserCount(tokenId) {
    const result = await db.queryOne(
      `SELECT COUNT(DISTINCT user_id) as count FROM discount_token_usage WHERE token_id = $1`,
      [tokenId]
    );
    return parseInt(result?.count || 0);
  },
};

module.exports = discountTokenService;
