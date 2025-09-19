// src/modules/vocabulary/router.js
// Vocabulary routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { getVocabularyWords, getAllVocabulary } = require('./controller');

// Public routes
router.get('/', authenticateToken, getAllVocabulary);
router.get('/words/:week/:day', authenticateToken, getVocabularyWords);

module.exports = router;