// src/modules/reports/router.js
// Reports routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { 
  getReportValidation,
  generateReportValidation
} = require('./schema');
const { 
  getReport,
  generateReport,
  generateReportWithAttempts
} = require('./controller');

// Public routes
router.get('/:userId/:date', authenticateToken, getReportValidation, getReport);
router.post('/generate', authenticateToken, generateReportValidation, generateReport);
router.post('/generate-with-attempts', authenticateToken, generateReportWithAttempts);

module.exports = router;