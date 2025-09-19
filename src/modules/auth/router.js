// src/modules/auth/router.js
// Authentication routes

const express = require('express');
const router = express.Router();

const { authenticateToken, requireAdmin } = require('../../core/http/middlewares/auth');
const { registerValidation, loginValidation, changePasswordValidation } = require('./schema');
const { 
  register,
  login,
  refreshToken,
  getProfile,
  updateProfileHandler,
  changePasswordHandler,
  googleToken,
  googleIdToken,
  googleAuth,
  adminRegisterHandler,
  validateAdminTokenHandler
} = require('./controller');

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshToken);

// Google authentication routes
router.post('/google-token', googleToken);
router.post('/google-id-token', googleIdToken);
router.post('/google', googleAuth);

// Admin routes
router.post('/admin-register', adminRegisterHandler);
router.post('/validate-admin-token', validateAdminTokenHandler);

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfileHandler);
router.put('/change-password', authenticateToken, changePasswordValidation, changePasswordHandler);

module.exports = router;