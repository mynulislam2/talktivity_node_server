// src/modules/onboarding/router.js
// Onboarding routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { 
  saveOnboarding,
  getOnboarding
} = require('./controller');

// Public routes
router.post('/', authenticateToken, saveOnboarding);
router.get('/', authenticateToken, getOnboarding);

module.exports = router;