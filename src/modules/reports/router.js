/**
 * Reports Module Router (Postman-aligned)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const reportsController = require('./controller');

// GET /api/reports/daily?date=YYYY-MM-DD
router.get('/daily', authenticateToken, reportsController.getDailyReport);

// POST /api/reports/daily/generate
router.post('/daily/generate', authenticateToken, reportsController.generateDailyReport);

// GET /api/reports/call - Get call report for all conversations
router.get('/call', authenticateToken, reportsController.generateCallReport);

module.exports = router;

