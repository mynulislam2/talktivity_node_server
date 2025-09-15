// src/modules/quiz/router.js
// Quiz routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { 
  generateQuizWithAttempts,
  generateListeningQuizWithAttempts
} = require('./controller');

// Public routes
router.post('/generate-quiz-with-attempts', authenticateToken, generateQuizWithAttempts);
router.post('/generate-listening-quiz-with-attempts', authenticateToken, generateListeningQuizWithAttempts);

module.exports = router;