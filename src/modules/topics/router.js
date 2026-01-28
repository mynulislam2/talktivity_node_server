/**
 * Topics Module Router
 * Two endpoints: GET / (list topics) and GET /:id (get topic detail)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const topicsController = require('./controller');

// GET /api/topics - List all topics
router.get('/', authenticateToken, topicsController.listTopics);

// GET /api/topics/:topicId - Get topic detail
router.get('/:topicId', authenticateToken, topicsController.getTopicDetail);

// POST /api/topics - Create custom topic
router.post('/', authenticateToken, topicsController.createTopic);

module.exports = router;
