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

module.exports = { globalLimiter, authLimiter, adminLimiter, groupLimiter };
