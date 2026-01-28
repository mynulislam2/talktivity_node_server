/**
 * Leaderboard Module Exports
 */

const leaderboardRouter = require('./router');
const leaderboardController = require('./controller');
const leaderboardService = require('./service');
const leaderboardRepo = require('./repo');

module.exports = { leaderboardRouter, leaderboardController, leaderboardService, leaderboardRepo };
