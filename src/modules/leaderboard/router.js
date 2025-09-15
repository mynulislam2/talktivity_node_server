// src/modules/leaderboard/router.js
// Leaderboard routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { 
  getWeeklyLeaderboard,
  getOverallLeaderboard,
  getUserPosition
} = require('./controller');

// Public routes
router.get('/weekly', authenticateToken, getWeeklyLeaderboard);
router.get('/overall', authenticateToken, getOverallLeaderboard);
router.get('/my-position', authenticateToken, getUserPosition);

module.exports = router;