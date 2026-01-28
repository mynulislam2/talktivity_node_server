/**
 * Call Module Router
 * Routes for call session management
 */

const express = require('express');
const router = express.Router();
const callController = require('./controller');
const { authenticateToken } = require('../../core/http/middlewares/auth');

// All call routes require authentication
router.use(authenticateToken);

// GET /api/call/status - Get call session status and statistics
router.get('/status', callController.getCallStatus);

// GET /api/call/check-eligibility - Check if user can start a call
router.get('/check-eligibility', callController.checkEligibility);

module.exports = router;
