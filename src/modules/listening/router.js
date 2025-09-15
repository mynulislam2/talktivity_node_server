// src/modules/listening/router.js
// Listening routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { 
  getListeningTopics,
  getCourseStatus,
  createCourse
} = require('./controller');

// Public routes
router.get('/topics', authenticateToken, getListeningTopics);
router.get('/course/status', authenticateToken, getCourseStatus);
router.post('/course/initialize', authenticateToken, createCourse);

module.exports = router;