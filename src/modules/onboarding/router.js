// src/modules/onboarding/router.js
const express = require('express');
const router = express.Router();

// ✅ CORRECTED IMPORT - Fixed path to auth middleware
const { authenticateToken } = require('../../core/http/middlewares/auth');

// Import controllers
const {
  saveOnboardingDataController,
  saveOnboardingDataTestController,
  getOwnOnboardingData,
  getOnboardingDataByUserId
} = require('./controller');

// POST /api/onboarding - Save or update user's own onboarding data
router.post('/onboarding', authenticateToken, saveOnboardingDataController);

// POST /api/onboarding/test - Test endpoint for onboarding data
router.post('/onboarding/test', authenticateToken, saveOnboardingDataTestController);

// GET /api/onboarding - Get authenticated user's own onboarding data
router.get('/onboarding', authenticateToken, getOwnOnboardingData);

// GET /api/onboarding/user/:user_id - Get onboarding data by specific user ID (admin/teacher access)
router.get('/onboarding/user/:user_id', authenticateToken, getOnboardingDataByUserId);

module.exports = router;