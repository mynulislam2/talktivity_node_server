/**
 * AI Module Router
 * Endpoints for AI-powered content generation
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const aiController = require('./controller');

// POST /api/ai/generate-roleplay - Generate roleplay scenario prompts
router.post('/generate-roleplay', authenticateToken, aiController.generateRolePlay);

// GET /api/ai/generate-quiz - Generate quiz from conversations
router.get('/generate-quiz', authenticateToken, aiController.generateQuiz);

// POST /api/ai/generate-listening-quiz - Generate listening quiz
router.post('/generate-listening-quiz', authenticateToken, aiController.generateListeningQuiz);

module.exports = router;
