const express = require('express');
const router = express.Router();
const {
  handleGoogleOAuth,
  handleGoogleToken,
  handleTokenRefresh,
  handleAutoVerifyEmails,
} = require('./google-auth-controller');
const { validateJWTSecret } = require('./google-auth-service');

/**
 * Google Authentication Routes
 * 
 * POST /google           - OAuth code exchange (main flow)
 * POST /google-token     - ID token authentication
 * POST /refresh          - Refresh access token
 * POST /auto-verify-emails - Auto-verify all unverified user emails
 */

// Validate JWT_SECRET on route initialization
try {
  validateJWTSecret();
} catch (error) {
  console.error('❌ JWT_SECRET validation failed:', error.message);
  throw error;
}

// POST /google - Handle Google OAuth code exchange
router.post('/google', handleGoogleOAuth);

// POST /google-token - Handle Google ID token authentication
router.post('/google-token', handleGoogleToken);

// POST /refresh - Refresh access token
router.post('/refresh', handleTokenRefresh);

// POST /auto-verify-emails - Auto-verify all unverified user emails
router.post('/auto-verify-emails', handleAutoVerifyEmails);

module.exports = router;
