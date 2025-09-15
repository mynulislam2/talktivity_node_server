// src/core/http/response.js
// Standardized response formatting

const successResponse = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data
  };
};

const errorResponse = (error, message = 'An error occurred') => {
  return {
    success: false,
    error: message,
    details: process.env.NODE_ENV === 'development' ? error : undefined
  };
};

module.exports = {
  successResponse,
  errorResponse
};