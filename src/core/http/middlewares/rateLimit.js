/**
 * Rate Limit Middleware
 * Provides global and scoped rate limiters
 */

const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
});

const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
});

const groupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});

/**
 * Email Rate Limiter
 * Strict rate limit for email-sending endpoints (forgot password, verification)
 * 3 requests per 15 minutes to prevent abuse
 */
const emailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per window
  message: {
    success: false,
    error: 'Too many requests. Please try again in 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again in 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

module.exports = { globalLimiter, authLimiter, adminLimiter, groupLimiter, emailRateLimiter };
