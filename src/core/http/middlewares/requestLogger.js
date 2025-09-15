// src/core/http/middlewares/requestLogger.js
// Request logging middleware

// Simple request logging middleware
const requestLogger = (req, res, next) => {
  // Log incoming requests
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip || req.connection.remoteAddress}`);
  next();
};

module.exports = { requestLogger };