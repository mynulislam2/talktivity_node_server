/**
 * Leaderboard Module Controller (Postman-aligned)
 */

const leaderboardService = require('./service');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

const leaderboardController = {
  async getLeaderboard(req, res) {
    try {
      const userId = req.user?.userId;
      const period = (req.query.period || 'week').toLowerCase();

      let board;
      if (period === 'all') {
        board = await leaderboardService.getOverallLeaderboard();
      } else {
        // Treat both "today" and "week" as weekly snapshot for now
        board = await leaderboardService.getWeeklyLeaderboard();
      }

      let userRank = null;
      if (userId) {
        const type = period === 'all' ? 'overall' : 'weekly';
        try {
          userRank = await leaderboardService.getUserPosition(userId, type);
        } catch (err) {
          if (!(err instanceof NotFoundError) && !(err instanceof ValidationError)) {
            throw err;
          }
        }
      }

      res.json({
        success: true,
        data: {
          period,
          leaderboard: board.leaderboard,
          totalParticipants: board.totalParticipants,
          userRank,
        },
      });
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
    }
  },
};

module.exports = leaderboardController;
