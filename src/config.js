/**
 * Application Configuration
 * Centralized configuration for the Express app
 */

module.exports = {
  CORS: {
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim())
  },
  PORT: process.env.API_PORT || 8082
};
