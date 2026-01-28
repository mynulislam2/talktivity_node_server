/**
 * Leaderboard Module Repository
 */

const db = require('../../core/db/client');

const leaderboardRepo = {
  async getRankByScore(score) {
    return await db.queryOne(
      `SELECT COUNT(*) as rank FROM user_scores WHERE score > $1`,
      [score]
    );
  },
};

module.exports = leaderboardRepo;
