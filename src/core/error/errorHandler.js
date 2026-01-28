/**
 * Error Handler Middleware
 */

const { AppError } = require('./errors');

const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', {
    message: err.message,
    code: err.code || 'UNKNOWN',
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const response = {
    success: false,
    error: err.message,
    code: err.code || 'INTERNAL_ERROR',
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id,
    },
  };

  if (err instanceof AppError) {
    return res.status(err.statusCode).json(response);
  }

  // Default: 500 Internal Server Error
  res.status(500).json(response);
};

module.exports = errorHandler;
