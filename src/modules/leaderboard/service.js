/**
 * Leaderboard Module Service
 * Manages ranking, XP calculation, and leaderboard generation
 */

const db = require('../../core/db/client');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

/**
 * Calculate week start and end dates
 * @returns {Object} Object with weekStart and weekEnd dates
 */
function getWeekDateRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

/**
 * Build leaderboard query with optional date filter
 * @param {Date|null} weekStart - Week start date
 * @param {Date|null} weekEnd - Week end date
 * @returns {Object} Query object with query string
 */
function buildLeaderboardQuery(weekStart, weekEnd) {
  const isWeekly = weekStart && weekEnd;

  const query = `
    WITH user_stats AS (
      SELECT 
        u.id,
        u.full_name,
        u.profile_picture,
        COALESCE(SUM(dp.speaking_duration_seconds), 0) + COALESCE(SUM(ss.duration_seconds), 0) as total_speaking_seconds,
        COALESCE(COUNT(DISTINCT CASE WHEN dp.speaking_duration_seconds >= 300 THEN dp.id END), 0) + 
          COALESCE(COUNT(DISTINCT CASE WHEN ss.duration_seconds >= 300 THEN ss.id END), 0) as full_sessions,
        COALESCE(COUNT(DISTINCT CASE WHEN dp.speaking_quiz_completed = true THEN dp.id END), 0) as quiz_count,
        COALESCE(COUNT(DISTINCT CASE WHEN we.exam_score >= 60 THEN we.id END), 0) as exam_count,
        COALESCE(
          (WITH speaking_days AS (
            SELECT DISTINCT progress_date AS date
            FROM daily_progress
            WHERE user_id = u.id 
              ${isWeekly ? 'AND progress_date >= $1 AND progress_date <= $2' : ''}
              AND speaking_completed = true
            UNION
            SELECT DISTINCT created_at::date as date
            FROM speaking_sessions
            WHERE user_id = u.id
              ${isWeekly ? 'AND created_at::date >= $1 AND created_at::date <= $2' : ''}
              AND duration_seconds > 0
          ), consecutive_groups AS (
            SELECT date,
                   date - (ROW_NUMBER() OVER (ORDER BY date DESC) || ' days')::interval as grp
            FROM speaking_days
          )
          SELECT COUNT(*) 
          FROM consecutive_groups
          WHERE grp = (
            SELECT grp FROM consecutive_groups 
            WHERE date = (SELECT MAX(date) FROM speaking_days WHERE date <= CURRENT_DATE)
          )), 0
        ) as streak_days
      FROM users u
      LEFT JOIN daily_progress dp ON u.id = dp.user_id ${isWeekly ? 'AND dp.progress_date >= $1 AND dp.progress_date <= $2' : ''}
      LEFT JOIN speaking_sessions ss ON u.id = ss.user_id 
        ${isWeekly ? 'AND ss.created_at::date >= $1 AND ss.created_at::date <= $2' : ''}
        AND ss.duration_seconds > 0
      LEFT JOIN weekly_exams we ON u.id = we.user_id ${isWeekly ? 'AND we.exam_date >= $1 AND we.exam_date <= $2' : ''}
      WHERE u.is_admin = false
      GROUP BY u.id, u.full_name, u.profile_picture
    )
    SELECT 
      id,
      full_name,
      profile_picture,
      calculate_user_xp(
        total_speaking_seconds::INT,
        full_sessions::INT,
        quiz_count::INT,
        exam_count::INT,
        streak_days::INT
      ) as total_xp,
      FLOOR(calculate_user_xp(
        total_speaking_seconds::INT,
        full_sessions::INT,
        quiz_count::INT,
        exam_count::INT,
        streak_days::INT
      ) / 100) + 1 as level
    FROM user_stats
    WHERE calculate_user_xp(
      total_speaking_seconds::INT,
      full_sessions::INT,
      quiz_count::INT,
      exam_count::INT,
      streak_days::INT
    ) > 0
    ORDER BY total_xp DESC, level DESC
    LIMIT 50
  `;

  return { query, isWeekly };
}

const leaderboardService = {
  /**
   * Get weekly leaderboard
   */
  async getWeeklyLeaderboard() {
    const { weekStart, weekEnd } = getWeekDateRange();

    console.log('Weekly leaderboard date range:', {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });

    const { query } = buildLeaderboardQuery(weekStart, weekEnd);

    const result = await db.query(query, [weekStart, weekEnd]);

    return {
      leaderboard: result.rows.map((user, index) => ({
        position: index + 1,
        id: user.id,
        name: user.full_name || 'Anonymous User',
        profile_picture: user.profile_picture,
        level: user.level,
        xp: user.total_xp,
        isCrown: index === 0,
      })),
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      totalParticipants: result.rows.length,
    };
  },

  /**
   * Get overall (all-time) leaderboard
   */
  async getOverallLeaderboard() {
    const { query } = buildLeaderboardQuery(null, null);

    const result = await db.query(query);

    return {
      leaderboard: result.rows.map((user, index) => ({
        position: index + 1,
        id: user.id,
        name: user.full_name || 'Anonymous User',
        profile_picture: user.profile_picture,
        level: user.level,
        xp: user.total_xp,
        isCrown: index === 0,
      })),
      totalParticipants: result.rows.length,
    };
  },

  /**
   * Get user's position in leaderboard
   */
  async getUserPosition(userId, type = 'weekly') {
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    // Reuse existing leaderboard data instead of complex SQL
    const board =
      type === 'weekly'
        ? await this.getWeeklyLeaderboard()
        : await this.getOverallLeaderboard();

    const index = board.leaderboard.findIndex((user) => user.id === userId);

    if (index === -1) {
      throw new NotFoundError('User not found in leaderboard');
    }

    const user = board.leaderboard[index];
    const userXP = user.xp;
    const userLevel = user.level;

    return {
      position: index + 1,
      user: {
        id: user.id,
        name: user.name || 'Anonymous User',
        profile_picture: user.profile_picture,
        level: userLevel,
        xp: userXP,
        xpForNextLevel: userLevel * 100,
        xpProgress: Math.round(((userXP % 100) / 100) * 100),
      },
      type,
    };
  },
};

module.exports = leaderboardService;
