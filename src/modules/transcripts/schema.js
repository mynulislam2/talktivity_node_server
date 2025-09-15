// src/modules/transcripts/schema.js
// Transcripts validation schemas

const { body, param, query } = require('express-validator');

const storeTranscriptValidation = [
  body('user_id').isInt({ min: 1 }),
  body('transcript').notEmpty(),
  body('room_name').optional().isString(),
  body('session_duration').optional().isInt({ min: 0 }),
  body('agent_state').optional().isString()
];

const getTranscriptsValidation = [
  param('userId').isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }).default(10),
  query('offset').optional().isInt({ min: 0 }).default(0)
];

module.exports = {
  storeTranscriptValidation,
  getTranscriptsValidation
};