// src/modules/auth/router.js
// Authentication routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { registerValidation, loginValidation, changePasswordValidation } = require('./schema');
const { 
  register,
  login,
  refreshToken,
  getProfile,
  updateProfileHandler,
  changePasswordHandler
} = require('./controller');

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/refresh-token', refreshToken);

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfileHandler);
router.put('/change-password', authenticateToken, changePasswordValidation, changePasswordHandler);

module.exports = router;