/**
 * Vocabulary Module Router (Postman-aligned)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const vocabularyController = require('./controller');

// GET /api/vocabulary/words?week=1&day=3
router.get('/words', authenticateToken, vocabularyController.getWordsForDay);

// POST /api/vocabulary/complete
router.post('/complete', authenticateToken, vocabularyController.markDayComplete);

module.exports = router;
