const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./auth-routes');
const db = require('../db');

// Get weekly leaderboard
router.get('/weekly', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    // Get current week's start date (Monday)
    const now = new Date();
    const weekStart = new Date(now);
    // Fix: getDay() returns 0 for Sunday, so we need to handle this case
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back (dayOfWeek - 1) days
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday
    weekEnd.setHours(23, 59, 59, 999);

    console.log('Weekly leaderboard date range:', {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      currentDate: now.toISOString()
    });

    // Check if there are any users in the database
    const userCountResult = await client.query('SELECT COUNT(*) as count FROM users WHERE is_admin = false');
    console.log('Total non-admin users in database:', userCountResult.rows[0].count);

    // Check if there's any daily_progress data in the date range
    const progressCountResult = await client.query(
      'SELECT COUNT(*) as count FROM daily_progress WHERE date >= $1 AND date <= $2',
      [weekStart, weekEnd]
    );
    console.log('Daily progress entries in date range:', progressCountResult.rows[0].count);

    // Get all users with their weekly XP and level
    // Using same formula as analytics: 2 XP per minute + 10 XP per full 5-min session + 15 XP per quiz + 50 XP per exam + 5 XP per streak
    const leaderboardQuery = `
      WITH user_weekly_stats AS (
        SELECT 
          u.id,
          u.full_name,
          u.profile_picture,
          -- Course-based speaking time and sessions
          COALESCE(SUM(dp.speaking_duration_seconds), 0) as course_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dp.speaking_duration_seconds >= 300 THEN dp.id END), 0) as course_full_sessions,
          -- Practice/call speaking time and sessions
          COALESCE(SUM(dss.duration_seconds), 0) as practice_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dss.duration_seconds >= 300 THEN dss.id END), 0) as practice_full_sessions,
          -- Quizzes and exams
          COALESCE(COUNT(DISTINCT CASE WHEN dp.quiz_completed = true THEN dp.id END), 0) as quiz_count,
          COALESCE(COUNT(DISTINCT CASE WHEN we.exam_score >= 60 THEN we.id END), 0) as exam_count,
          -- Streak calculation: count consecutive days with any speaking activity (course-based OR practice/call)
          -- Count days where user had speaking activity (from daily_progress OR device_speaking_sessions)
          COALESCE(
            (WITH speaking_days AS (
              -- Get all days with course-based speaking
              SELECT DISTINCT date
              FROM daily_progress
              WHERE user_id = u.id 
                AND date >= $1 
                AND date <= $2
                AND speaking_completed = true
              UNION
              -- Get all days with practice/call speaking
              SELECT DISTINCT date
              FROM device_speaking_sessions
              WHERE user_id = u.id
                AND date >= $1 
                AND date <= $2
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
        LEFT JOIN daily_progress dp ON u.id = dp.user_id 
          AND dp.date >= $1 
          AND dp.date <= $2
        LEFT JOIN device_speaking_sessions dss ON u.id = dss.user_id
          AND dss.date >= $1 
          AND dss.date <= $2
          AND dss.duration_seconds > 0
        LEFT JOIN weekly_exams we ON u.id = we.user_id 
          AND we.exam_date >= $1 
          AND we.exam_date <= $2
        WHERE u.is_admin = false
        GROUP BY u.id, u.full_name, u.profile_picture
      )
      SELECT 
        id,
        full_name,
        profile_picture,
        -- Calculate XP using DB function for consistency
        calculate_user_xp(
          (course_speaking_seconds + practice_speaking_seconds)::INT,
          (course_full_sessions + practice_full_sessions)::INT,
          quiz_count::INT,
          exam_count::INT,
          streak_days::INT
        ) as total_xp,
        FLOOR(calculate_user_xp(
          (course_speaking_seconds + practice_speaking_seconds)::INT,
          (course_full_sessions + practice_full_sessions)::INT,
          quiz_count::INT,
          exam_count::INT,
          streak_days::INT
        ) / 100) + 1 as level
      FROM user_weekly_stats
      WHERE calculate_user_xp(
        (course_speaking_seconds + practice_speaking_seconds)::INT,
        (course_full_sessions + practice_full_sessions)::INT,
        quiz_count::INT,
        exam_count::INT,
        streak_days::INT
      ) > 0
      ORDER BY total_xp DESC, level DESC
      LIMIT 50
    `;

    const result = await client.query(leaderboardQuery, [weekStart, weekEnd]);
    
    // Format the response
    const leaderboard = result.rows.map((user, index) => ({
      position: index + 1,
      id: user.id,
      name: user.full_name || 'Anonymous User',
      profile_picture: user.profile_picture,
      level: user.level,
      xp: user.total_xp,
      isCrown: index === 0 // First place gets crown
    }));

    res.json({
      success: true,
      data: {
        leaderboard,
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        totalParticipants: leaderboard.length
      }
    });

  } catch (error) {
    console.error('Error getting weekly leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get weekly leaderboard'
    });
  } finally {
    if (client) client.release();
  }
});

// Get overall leaderboard (all time)
router.get('/overall', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();

    // Get all users with their total XP and level
    // Using same formula as analytics: 2 XP per minute + 10 XP per full 5-min session + 15 XP per quiz + 50 XP per exam + 5 XP per streak
    const leaderboardQuery = `
      WITH user_total_stats AS (
        SELECT 
          u.id,
          u.full_name,
          u.profile_picture,
          -- Course-based speaking time and sessions
          COALESCE(SUM(dp.speaking_duration_seconds), 0) as course_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dp.speaking_duration_seconds >= 300 THEN dp.id END), 0) as course_full_sessions,
          -- Practice/call speaking time and sessions
          COALESCE(SUM(dss.duration_seconds), 0) as practice_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dss.duration_seconds >= 300 THEN dss.id END), 0) as practice_full_sessions,
          -- Quizzes and exams
          COALESCE(COUNT(DISTINCT CASE WHEN dp.quiz_completed = true THEN dp.id END), 0) as quiz_count,
          COALESCE(COUNT(DISTINCT CASE WHEN we.exam_score >= 60 THEN we.id END), 0) as exam_count,
          -- Streak calculation: count consecutive days with any speaking activity (course-based OR practice/call)
          COALESCE(
            (WITH speaking_days AS (
              -- Get all days with course-based speaking
              SELECT DISTINCT date
              FROM daily_progress
              WHERE user_id = u.id 
                AND speaking_completed = true
              UNION
              -- Get all days with practice/call speaking
              SELECT DISTINCT date
              FROM device_speaking_sessions
              WHERE user_id = u.id
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
        LEFT JOIN daily_progress dp ON u.id = dp.user_id
        LEFT JOIN device_speaking_sessions dss ON u.id = dss.user_id
          AND dss.duration_seconds > 0
        LEFT JOIN weekly_exams we ON u.id = we.user_id
        WHERE u.is_admin = false
        GROUP BY u.id, u.full_name, u.profile_picture
      )
      SELECT 
        id,
        full_name,
        profile_picture,
        -- Calculate XP using DB function for consistency
        calculate_user_xp(
          (course_speaking_seconds + practice_speaking_seconds)::INT,
          (course_full_sessions + practice_full_sessions)::INT,
          quiz_count::INT,
          exam_count::INT,
          streak_days::INT
        ) as total_xp,
        FLOOR(calculate_user_xp(
          (course_speaking_seconds + practice_speaking_seconds)::INT,
          (course_full_sessions + practice_full_sessions)::INT,
          quiz_count::INT,
          exam_count::INT,
          streak_days::INT
        ) / 100) + 1 as level
      FROM user_total_stats
      WHERE calculate_user_xp(
        (course_speaking_seconds + practice_speaking_seconds)::INT,
        (course_full_sessions + practice_full_sessions)::INT,
        quiz_count::INT,
        exam_count::INT,
        streak_days::INT
      ) > 0
      ORDER BY total_xp DESC, level DESC
      LIMIT 50
    `;

    const result = await client.query(leaderboardQuery);
    
    // Format the response
    const leaderboard = result.rows.map((user, index) => ({
      position: index + 1,
      id: user.id,
      name: user.full_name || 'Anonymous User',
      profile_picture: user.profile_picture,
      level: user.level,
      xp: user.total_xp,
      isCrown: index === 0 // First place gets crown
    }));

    res.json({
      success: true,
      data: {
        leaderboard,
        totalParticipants: leaderboard.length
      }
    });

  } catch (error) {
    console.error('Error getting overall leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get overall leaderboard'
    });
  } finally {
    if (client) client.release();
  }
});

// Get user's position in leaderboard
router.get('/my-position', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.userId; // Changed from req.user.id to req.user.userId
    const { type = 'weekly' } = req.query; // 'weekly' or 'overall'

    console.log('My position request:', {
      userId,
      type,
      user: req.user
    });

    let dateFilter = '';
    let params = [userId];

    if (type === 'weekly') {
      // Get current week's start date (Monday)
      const now = new Date();
      const weekStart = new Date(now);
      // Fix: getDay() returns 0 for Sunday, so we need to handle this case
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back (dayOfWeek - 1) days
      weekStart.setDate(now.getDate() - daysToMonday);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // Sunday
      weekEnd.setHours(23, 59, 59, 999);

      dateFilter = 'AND dp.date >= $2 AND dp.date <= $3 AND we.exam_date >= $2 AND we.exam_date <= $3';
      params = [userId, weekStart, weekEnd];
    }

    // Get user's XP and level
    // Using same formula as analytics: 2 XP per minute + 10 XP per full 5-min session + 15 XP per quiz + 50 XP per exam + 5 XP per streak
    const userStatsQuery = `
      WITH user_stats AS (
        SELECT 
          u.id,
          u.full_name,
          u.profile_picture,
          -- Course-based speaking time and sessions
          COALESCE(SUM(dp.speaking_duration_seconds), 0) as course_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dp.speaking_duration_seconds >= 300 THEN dp.id END), 0) as course_full_sessions,
          -- Practice/call speaking time and sessions
          COALESCE(SUM(dss.duration_seconds), 0) as practice_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dss.duration_seconds >= 300 THEN dss.id END), 0) as practice_full_sessions,
          -- Quizzes and exams
          COALESCE(COUNT(DISTINCT CASE WHEN dp.quiz_completed = true THEN dp.id END), 0) as quiz_count,
          COALESCE(COUNT(DISTINCT CASE WHEN we.exam_score >= 60 THEN we.id END), 0) as exam_count,
          -- Streak calculation: count consecutive days with any speaking activity (course-based OR practice/call)
          COALESCE(
            (WITH speaking_days AS (
              -- Get all days with course-based speaking
              SELECT DISTINCT date
              FROM daily_progress
              WHERE user_id = u.id 
                ${type === 'weekly' ? 'AND date >= $2 AND date <= $3' : ''}
                AND speaking_completed = true
              UNION
              -- Get all days with practice/call speaking
              SELECT DISTINCT date
              FROM device_speaking_sessions
              WHERE user_id = u.id
                ${type === 'weekly' ? 'AND date >= $2 AND date <= $3' : ''}
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
        LEFT JOIN daily_progress dp ON u.id = dp.user_id ${type === 'weekly' ? 'AND dp.date >= $2 AND dp.date <= $3' : ''}
        LEFT JOIN device_speaking_sessions dss ON u.id = dss.user_id
          ${type === 'weekly' ? 'AND dss.date >= $2 AND dss.date <= $3' : ''}
          AND dss.duration_seconds > 0
        LEFT JOIN weekly_exams we ON u.id = we.user_id ${type === 'weekly' ? 'AND we.exam_date >= $2 AND we.exam_date <= $3' : ''}
        WHERE u.id = $1
        GROUP BY u.id, u.full_name, u.profile_picture
      )
      SELECT 
        id,
        full_name,
        profile_picture,
        -- Calculate XP using DB function for consistency
        calculate_user_xp(
          (course_speaking_seconds + practice_speaking_seconds)::INT,
          (course_full_sessions + practice_full_sessions)::INT,
          quiz_count::INT,
          exam_count::INT,
          streak_days::INT
        ) as total_xp,
        FLOOR(calculate_user_xp(
          (course_speaking_seconds + practice_speaking_seconds)::INT,
          (course_full_sessions + practice_full_sessions)::INT,
          quiz_count::INT,
          exam_count::INT,
          streak_days::INT
        ) / 100) + 1 as level
      FROM user_stats
    `;

    const userResult = await client.query(userStatsQuery, params);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userStats = userResult.rows[0];
    const userXP = userStats.total_xp;
    const userLevel = userStats.level;

    // Get user's position by counting users with higher XP
    // Using same formula as analytics: 2 XP per minute + 10 XP per full 5-min session + 15 XP per quiz + 50 XP per exam + 5 XP per streak
    const positionQuery = `
      WITH user_total_stats AS (
        SELECT 
          u.id,
          -- Course-based speaking time and sessions
          COALESCE(SUM(dp.speaking_duration_seconds), 0) as course_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dp.speaking_duration_seconds >= 300 THEN dp.id END), 0) as course_full_sessions,
          -- Practice/call speaking time and sessions
          COALESCE(SUM(dss.duration_seconds), 0) as practice_speaking_seconds,
          COALESCE(COUNT(DISTINCT CASE WHEN dss.duration_seconds >= 300 THEN dss.id END), 0) as practice_full_sessions,
          -- Quizzes and exams
          COALESCE(COUNT(DISTINCT CASE WHEN dp.quiz_completed = true THEN dp.id END), 0) as quiz_count,
          COALESCE(COUNT(DISTINCT CASE WHEN we.exam_score >= 60 THEN we.id END), 0) as exam_count,
          -- Streak calculation: count consecutive days with any speaking activity (course-based OR practice/call)
          COALESCE(
            (WITH speaking_days AS (
              -- Get all days with course-based speaking
              SELECT DISTINCT date
              FROM daily_progress
              WHERE user_id = u.id 
                ${type === 'weekly' ? 'AND date >= $2 AND date <= $3' : ''}
                AND speaking_completed = true
              UNION
              -- Get all days with practice/call speaking
              SELECT DISTINCT date
              FROM device_speaking_sessions
              WHERE user_id = u.id
                ${type === 'weekly' ? 'AND date >= $2 AND date <= $3' : ''}
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
        LEFT JOIN daily_progress dp ON u.id = dp.user_id ${type === 'weekly' ? 'AND dp.date >= $2 AND dp.date <= $3' : ''}
        LEFT JOIN device_speaking_sessions dss ON u.id = dss.user_id
          ${type === 'weekly' ? 'AND dss.date >= $2 AND dss.date <= $3' : ''}
          AND dss.duration_seconds > 0
        LEFT JOIN weekly_exams we ON u.id = we.user_id ${type === 'weekly' ? 'AND we.exam_date >= $2 AND we.exam_date <= $3' : ''}
        WHERE u.is_admin = false
        GROUP BY u.id
      )
      SELECT COUNT(*) + 1 as position
      FROM user_total_stats
      WHERE calculate_user_xp(
        (course_speaking_seconds + practice_speaking_seconds)::INT,
        (course_full_sessions + practice_full_sessions)::INT,
        quiz_count::INT,
        exam_count::INT,
        streak_days::INT
      ) > $1
    `;

    const positionResult = await client.query(positionQuery, [userXP, ...params.slice(1)]);
    const position = positionResult.rows[0].position;

    res.json({
      success: true,
      data: {
        position,
        user: {
          id: userStats.id,
          name: userStats.full_name || 'Anonymous User',
          profile_picture: userStats.profile_picture,
          level: userLevel,
          xp: userXP,
          xpForNextLevel: userLevel * 100,
          xpProgress: Math.round(((userXP % 100) / 100) * 100)
        },
        type
      }
    });

  } catch (error) {
    console.error('Error getting user position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user position'
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;

