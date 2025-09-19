// src/modules/reports/schema.js
// Reports validation schemas

const { param, body, validationResult } = require('express-validator');

// Validation for getting a report
const getReportValidation = [
  // Validate userId parameter
  param('userId').isInt().withMessage('User ID must be an integer'),
  
  // Validate date parameter
  param('date').isISO8601().withMessage('Date must be in ISO 8601 format (YYYY-MM-DD)'),
  
  // Check for validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

// Validation for generating a report
const generateReportValidation = [
  // Validate userId in body
  body('userId').isInt().withMessage('User ID must be an integer'),
  
  // Validate date in body
  body('date').isISO8601().withMessage('Date must be in ISO 8601 format (YYYY-MM-DD)'),
  
  // Validate transcriptData in body
  body('transcriptData').isObject().withMessage('Transcript data must be an object'),
  
  // Check for validation errors
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  getReportValidation,
  generateReportValidation
};