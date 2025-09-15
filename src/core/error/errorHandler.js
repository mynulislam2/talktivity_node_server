// src/core/error/errorHandler.js
// Global error handling middleware

const { errorResponse } = require('../http/response');
const { 
  ValidationError, 
  AuthenticationError, 
  AuthorizationError, 
  NotFoundError, 
  DatabaseError 
} = require('./errors');

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Handle specific error types
  if (err instanceof ValidationError) {
    return res.status(400).json(errorResponse(err.message, 'Validation Error'));
  }

  if (err instanceof AuthenticationError) {
    return res.status(401).json(errorResponse(err.message, 'Authentication Error'));
  }

  if (err instanceof AuthorizationError) {
    return res.status(403).json(errorResponse(err.message, 'Authorization Error'));
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json(errorResponse(err.message, 'Not Found'));
  }

  if (err instanceof DatabaseError) {
    return res.status(500).json(errorResponse(err.message, 'Database Error'));
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(errorResponse('Invalid token', 'Authentication Error'));
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json(errorResponse('Token expired', 'Authentication Error'));
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json(errorResponse(err.message || 'Internal server error'));
};

module.exports = { errorHandler };