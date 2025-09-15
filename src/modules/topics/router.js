// src/modules/topics/router.js
// Topics routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { 
  createTopicValidation,
  createBulkTopicsValidation
} = require('./schema');
const { 
  createTopic,
  createBulkTopics,
  getAllTopics,
  getTopicByCategory,
  generateRoleplay
} = require('./controller');

// Public routes
router.post('/', authenticateToken, createTopicValidation, createTopic);
router.post('/bulk', authenticateToken, createBulkTopicsValidation, createBulkTopics);
router.get('/', authenticateToken, getAllTopics);
router.get('/:category_name', authenticateToken, getTopicByCategory);
router.post('/generate-roleplay', authenticateToken, generateRoleplay);

module.exports = router;