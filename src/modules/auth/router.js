/**
 * Auth Module Router
 * Endpoints: register, login, refresh-token, password reset, email verification
 */

const express = require('express');
const router = express.Router();
const authController = require('./controller');
const { authenticateToken } = require('../../core/http/middlewares/auth');
const { emailRateLimiter } = require('../../core/http/middlewares/rateLimit');

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/refresh-token
router.post('/refresh-token', authController.refreshToken);

// GET /api/auth/me (get current user)
router.get('/me', authenticateToken, authController.getCurrentUser);

// POST /api/auth/logout (optional, client handles token deletion)
router.post('/logout', authenticateToken, authController.logout);

// ==========================================
// Password Reset Routes (Unauthenticated)
// ==========================================

// POST /api/auth/forgot-password - Send reset code
router.post('/forgot-password', emailRateLimiter, authController.forgotPassword);

// POST /api/auth/verify-reset-code - Verify reset code
router.post('/verify-reset-code', emailRateLimiter, authController.verifyResetCode);

// POST /api/auth/reset-password - Reset password
router.post('/reset-password', emailRateLimiter, authController.resetPassword);

// ==========================================
// Email Verification Routes (Authenticated)
// ==========================================

// POST /api/auth/send-verification-email - Send verification code
router.post('/send-verification-email', authenticateToken, emailRateLimiter, authController.sendEmailVerificationCode);

// POST /api/auth/verify-email - Verify email with code
router.post('/verify-email', authenticateToken, emailRateLimiter, authController.verifyEmail);

module.exports = router;
