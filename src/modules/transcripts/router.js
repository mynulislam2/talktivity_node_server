// src/modules/transcripts/router.js
// Transcripts routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { storeTranscriptValidation, getTranscriptsValidation } = require('./schema');
const { 
  store,
  getLatest,
  checkExperience
} = require('./controller');

// Public routes
router.post('/', authenticateToken, storeTranscriptValidation, store);
router.get('/users/:userId/latest-conversations', authenticateToken, getTranscriptsValidation, getLatest);
router.get('/users/:userId/experience', authenticateToken, checkExperience);

module.exports = router;