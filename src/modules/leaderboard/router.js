/**
 * Leaderboard Module Router (Postman-aligned)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const leaderboardController = require('./controller');

// GET /api/leaderboard?period=week|today|all
router.get('/', authenticateToken, leaderboardController.getLeaderboard);

module.exports = router;
