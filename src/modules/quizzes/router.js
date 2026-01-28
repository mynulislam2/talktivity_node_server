/**
 * Quizzes Module Router
 * Single endpoint: POST /api/quizzes/generate
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const quizzesController = require('./controller');

router.post('/generate', authenticateToken, quizzesController.generateQuiz);

module.exports = router;
