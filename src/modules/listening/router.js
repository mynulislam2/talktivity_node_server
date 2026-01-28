/**
 * Listening Module Router
 * Two endpoints: Generate listening quiz + Get audio
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const listeningController = require('./controller');

// POST /api/listening/generate-quiz - Generate listening quiz from topic
router.post('/generate-quiz', authenticateToken, listeningController.generateListeningQuiz);

// GET /api/listening/audio - Get listening audio URL
router.get('/audio', authenticateToken, listeningController.getListeningAudio);

module.exports = router;
