// src/modules/onboarding/router.js
// Onboarding routes

const express = require('express');
const router = express.Router();

// Import the authentication middleware
const { authenticateToken } = require('../core/http/middlewares/auth');

// Import the onboarding controller
const { saveOnboardingData, getOnboardingData } = require('./controller');

// POST /api/onboarding - Save or update onboarding data (with authentication)
router.post('/onboarding', authenticateToken, saveOnboardingData);

// GET /api/onboarding/:userId - Get onboarding data for a specific user
router.get('/onboarding/:userId', authenticateToken, getOnboardingData);

module.exports = router;