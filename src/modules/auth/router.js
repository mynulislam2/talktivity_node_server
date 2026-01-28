/**
 * Auth Module Router
 * Endpoints: register, login, refresh-token
 */

const express = require('express');
const router = express.Router();
const authController = require('./controller');
const { authenticateToken } = require('../../core/http/middlewares/auth');

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

module.exports = router;
