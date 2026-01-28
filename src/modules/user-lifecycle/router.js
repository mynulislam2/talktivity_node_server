/**
 * User Lifecycle Module Router
 * Routes for lifecycle state management
 */

const express = require('express');
const router = express.Router();
const lifecycleController = require('./controller');
const { authenticateToken } = require('../../core/http/middlewares/auth');

// All lifecycle routes require authentication
router.use(authenticateToken);

// GET /api/lifecycle - Get complete lifecycle state
router.get('/', lifecycleController.getLifecycle);

// POST /api/lifecycle - Update lifecycle fields
router.post('/', lifecycleController.updateLifecycle);

module.exports = router;
