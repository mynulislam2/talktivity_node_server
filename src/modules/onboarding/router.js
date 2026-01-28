/**
 * Onboarding Module Router
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const onboardingController = require('./controller');

/**
 * POST /api/onboarding - Save or update onboarding data
 */
router.post('/', authenticateToken, onboardingController.saveOnboarding);

// Removed GET /api/onboarding. Use lifecycle API for onboarding and lifecycle details.

module.exports = router;
