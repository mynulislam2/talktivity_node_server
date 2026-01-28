/**
 * CORS Middleware
 * Centralized CORS configuration
 */

const cors = require('cors');
const config = require('../../../config');

module.exports = cors({
  origin: config.CORS.ALLOWED_ORIGINS,
  credentials: true,
});
