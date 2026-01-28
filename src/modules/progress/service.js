/**
 * Progress Module Service
 * Tracks daily progress and comprehensive progress overview
 */

const db = require('../../core/db/client');
const { NotFoundError, ValidationError } = require('../../core/error/errors');
const { getUtcToday } = require('../../utils/timezone');
const subscriptionsService = require('../subscriptions/service');

/**
 * Get today's date in UTC timezone
 * This ensures "today" is consistent across all services regardless of server timezone
 */
async function getTodayDate() {
  // Use UTC date consistently
  return getUtcToday();
}

function toISODateString(dateLike) {
  // If no date provided, we'll need to fetch from DB (handled in getDailyProgress)
  // For now, return null to indicate "use today from DB"
  if (!dateLike) return null;
  if (typeof dateLike !== 'string') {
    throw new ValidationError('Invalid date format. Expected YYYY-MM-DD', 'date');
  }
  // Basic YYYY-MM-DD check (avoid parsing weird formats)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    throw new ValidationError('Invalid date format. Expected YYYY-MM-DD', 'date');
  }
  return dateLike;
}

async function getCourseContextForDate(userId, targetDate) {
  const course = await db.queryOne(
    `SELECT id, course_start_date
     FROM user_courses
     WHERE user_id = $1 AND is_active = true
     LIMIT 1`,
    [userId]
  );

  if (!course) {
    throw new NotFoundError('Active course');
  }

  // Normalize dates to YYYY-MM-DD strings to avoid timezone issues
  // PostgreSQL DATE type returns as string "YYYY-MM-DD" (or Date object in some drivers)
  let courseStartStr;
  if (typeof course.course_start_date === 'string') {
    courseStartStr = course.course_start_date.split('T')[0];  // Handle both DATE and TIMESTAMP
  } else if (course.course_start_date instanceof Date) {
    courseStartStr = course.course_start_date.toISOString().split('T')[0];
  } else {
    // Fallback: try to convert to string
    courseStartStr = String(course.course_start_date).split('T')[0];
  }
  
  // Ensure targetDate is normalized to YYYY-MM-DD
  const targetDateStr = typeof targetDate === 'string'
    ? targetDate.split('T')[0]  // Already YYYY-MM-DD or has time component
    : (targetDate instanceof Date 
      ? targetDate.toISOString().split('T')[0]
      : String(targetDate).split('T')[0]);

  // Parse dates as UTC midnight to avoid timezone issues
  const courseStart = new Date(courseStartStr + 'T00:00:00.000Z');
  const date = new Date(targetDateStr + 'T00:00:00.000Z');

  // Calculate days difference (should be exact day count)
  // Use Math.round instead of Math.floor to handle any floating point precision issues
  const daysSinceStart = Math.max(
    0,
    Math.round((date - courseStart) / (1000 * 60 * 60 * 24))
  );
  
  // Debug logging (can be removed later)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[getCourseContextForDate] userId=${userId}, courseStart=${courseStartStr}, targetDate=${targetDateStr}, daysSinceStart=${daysSinceStart}, week=${Math.floor(daysSinceStart / 7) + 1}, day=${(daysSinceStart % 7) + 1}`);
  }

  const weekNumber = Math.floor(daysSinceStart / 7) + 1;
  const dayNumber = (daysSinceStart % 7) + 1;

  return {
    course_id: course.id,
    week_number: weekNumber,
    day_number: dayNumber,
  };
}

const progressService = {
  /**
   * Get a single day's progress (defaults to today)
   */
  async getDailyProgress(userId, date) {
    // If no date provided, get today's date from PostgreSQL (consistent with DB timezone)
    let targetDate = toISODateString(date);
    if (!targetDate) {
      targetDate = await getTodayDate();
    }
    
    const courseContext = await getCourseContextForDate(userId, targetDate);

    // Use DATE comparison to avoid timezone issues - cast both sides to DATE
    const progress = await db.queryOne(
      `SELECT * FROM daily_progress 
       WHERE user_id = $1 
       AND progress_date::date = $2::date`,
      [userId, targetDate]
    );

    // Compute remaining speaking/roleplay time based on plan and today's usage
    let remainingSpeakingSeconds = null;
    let remainingRoleplaySeconds = null;

    try {
      const subStatus = await subscriptionsService.getUserSubscriptionStatus(userId);
      const planType = subStatus?.subscription?.plan_type || null;

      // Match Python agent caps (see agent/config/constants.py)
      const PRACTICE_DAILY_CAP_SECONDS = 5 * 60;   // 5 minutes per day for practice
      const ROLEPLAY_BASIC_CAP_SECONDS = 5 * 60;   // 5 minutes per day for Basic/FreeTrial
      const ROLEPLAY_PRO_CAP_SECONDS = 55 * 60;    // 55 minutes per day for Pro

      const speakingUsed = progress?.speaking_duration_seconds || 0;
      const roleplayUsed = progress?.roleplay_duration_seconds || 0;

      const practiceCap = PRACTICE_DAILY_CAP_SECONDS;
      const roleplayCap =
        planType === 'Pro' ? ROLEPLAY_PRO_CAP_SECONDS : ROLEPLAY_BASIC_CAP_SECONDS;

      remainingSpeakingSeconds = Math.max(0, practiceCap - speakingUsed);
      remainingRoleplaySeconds = Math.max(0, roleplayCap - roleplayUsed);
    } catch (err) {
      console.error('[Progress] Failed to compute remaining time from daily_progress:', err.message);
    }

    // Always return course context so the frontend can rely on week/day even if progress row doesn't exist yet.
    return {
      date: targetDate,
      course: courseContext,
      progress: progress || null,
      remaining: {
        speaking_seconds: remainingSpeakingSeconds,
        roleplay_seconds: remainingRoleplaySeconds,
      },
    };
  },

  /**
   * Upsert a single day's progress (partial update allowed)
   */
  async upsertDailyProgress(userId, date, payload) {
    // If no date provided, get today's date from PostgreSQL (consistent with DB timezone)
    let targetDate = toISODateString(date);
    if (!targetDate) {
      targetDate = await getTodayDate();
    }

    // Always recalculate course/week/day context based on targetDate (ensures correct week/day for current date)
    const courseContext = await getCourseContextForDate(userId, targetDate);
    const normalizedPayload = { ...(payload || {}) };
    
    // Always update course_id, week_number, and day_number based on targetDate (don't preserve old values)
    normalizedPayload.course_id = courseContext.course_id;
    normalizedPayload.week_number = courseContext.week_number;
    normalizedPayload.day_number = courseContext.day_number;

    const allowedFields = [
      'course_id', 'week_number', 'day_number',
      'speaking_completed', 'speaking_started_at', 'speaking_ended_at', 'speaking_duration_seconds',
      'speaking_quiz_completed', 'speaking_quiz_score',
      'listening_completed', 'listening_quiz_completed', 'listening_quiz_score',
      'roleplay_completed', 'roleplay_started_at', 'roleplay_ended_at', 'roleplay_duration_seconds',
      'total_time_seconds',
    ];

    const fieldPairs = allowedFields
      .filter((field) => normalizedPayload[field] !== undefined)
      .map((field) => ({ field, value: normalizedPayload[field] }));

    if (fieldPairs.length === 0) {
      return await this.getDailyProgress(userId, targetDate);
    }

    const values = [userId, targetDate, ...fieldPairs.map((p) => p.value)];
    const setClause = fieldPairs
      .map((p, idx) => `${p.field} = $${idx + 3}`)
      .join(', ');

    const insertColumns = ['user_id', 'progress_date', ...fieldPairs.map((p) => p.field), 'updated_at', 'created_at'];
    const insertValues = ['$1', '$2', ...fieldPairs.map((_, idx) => `$${idx + 3}`), "(NOW() AT TIME ZONE 'UTC')", "(NOW() AT TIME ZONE 'UTC')"];

    const result = await db.queryOne(
      `WITH upd AS (
          UPDATE daily_progress
          SET ${setClause}, updated_at = (NOW() AT TIME ZONE 'UTC')
          WHERE user_id = $1 AND progress_date::date = $2::date
          RETURNING *
        ), ins AS (
          INSERT INTO daily_progress (${insertColumns.join(', ')})
          SELECT ${insertValues.join(', ')}
          WHERE NOT EXISTS (SELECT 1 FROM upd)
          RETURNING *
        )
        SELECT * FROM upd
        UNION ALL
        SELECT * FROM ins;`,
      values
    );

    return result;
  },

  /**
   * Get comprehensive progress overview (analytics + achievements)
   * Uses only new DB schema: daily_progress, speaking_sessions, user_courses
   */
  async getProgressOverview(userId) {
    // Get active course
    const course = await db.queryOne(
      `SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true LIMIT 1`,
      [userId]
    );

    if (!course) {
      return null;
    }

    // Calculate current streak (from speaking and roleplay in daily_progress)
    const streakResult = await db.queryOne(
      `WITH active_days AS (
         SELECT DISTINCT progress_date FROM daily_progress 
         WHERE user_id = $1 AND (speaking_completed = true OR roleplay_duration_seconds > 0)
       ), consecutive AS (
         SELECT progress_date AS date,
                ROW_NUMBER() OVER (ORDER BY progress_date DESC) as rn,
                progress_date - (ROW_NUMBER() OVER (ORDER BY progress_date DESC) || ' days')::interval as grp
         FROM active_days
       ), latest_group AS (
         SELECT grp FROM consecutive 
         WHERE date = (
           SELECT MAX(progress_date) FROM active_days WHERE progress_date <= (NOW() AT TIME ZONE 'UTC')::date
         )
       )
       SELECT COUNT(*) as current_streak
       FROM consecutive
       WHERE grp = (SELECT grp FROM latest_group)`,
      [userId]
    );

    const currentStreak = parseInt(streakResult?.current_streak || 0);

    // Aggregate daily speaking/listening/roleplay stats from daily_progress
    const progressStats = await db.queryOne(
      `SELECT 
         COUNT(*) as total_days,
         COUNT(CASE WHEN speaking_completed = true THEN 1 END) as speaking_days,
         SUM(CAST(COALESCE(speaking_duration_seconds, 0) AS INTEGER)) as total_speaking_time,
         COUNT(CASE WHEN speaking_duration_seconds >= 300 THEN 1 END) as full_speaking_sessions,
         COUNT(CASE WHEN speaking_quiz_completed = true THEN 1 END) as speaking_quiz_days,
         AVG(NULLIF(speaking_quiz_score, 0)) as avg_speaking_quiz_score,
         COUNT(CASE WHEN speaking_quiz_score = 100 THEN 1 END) as perfect_quiz_scores,
         COUNT(CASE WHEN speaking_quiz_score >= 80 THEN 1 END) as high_quiz_scores,
         COUNT(CASE WHEN listening_completed = true THEN 1 END) as listening_days,
         COUNT(CASE WHEN listening_quiz_completed = true THEN 1 END) as listening_quiz_days,
         SUM(CAST(COALESCE(roleplay_duration_seconds, 0) AS INTEGER)) as total_roleplay_time,
         COUNT(CASE WHEN roleplay_duration_seconds >= 300 THEN 1 END) as full_roleplay_sessions,
         AVG(NULLIF(listening_quiz_score, 0)) as avg_listening_quiz_score
       FROM daily_progress 
       WHERE user_id = $1`,
      [userId]
    );

    // Aggregate weekly exam stats from weekly_exams
    const examStats = await db.queryOne(
      `SELECT 
         COUNT(CASE WHEN exam_completed = true THEN 1 END) as exam_days,
         AVG(NULLIF(exam_score, 0)) as avg_exam_score,
         SUM(CAST(COALESCE(exam_duration_seconds, 0) AS INTEGER)) as total_exam_time,
         COUNT(CASE WHEN exam_score = 100 THEN 1 END) as perfect_exam_scores,
         COUNT(CASE WHEN exam_score >= 80 THEN 1 END) as high_exam_scores
       FROM weekly_exams
       WHERE user_id = $1`,
      [userId]
    );

    // Calculate totals (speaking and roleplay from daily_progress)
    const stats = progressStats;
    const exams = examStats || {};
    const totalSpeakingTime = parseInt(stats?.total_speaking_time || 0);
    const totalRoleplayTime = parseInt(stats?.total_roleplay_time || 0);
    const totalPracticeTime = totalSpeakingTime + totalRoleplayTime;
    const fullSessions = parseInt(stats?.full_speaking_sessions || 0) + parseInt(stats?.full_roleplay_sessions || 0);
    const totalQuizzes = parseInt(stats?.speaking_quiz_days || 0);
    const totalExams = parseInt(exams?.exam_days || 0);
    const perfectScores = parseInt(stats?.perfect_quiz_scores || 0) + parseInt(exams?.perfect_exam_scores || 0);
    const highScores = parseInt(stats?.high_quiz_scores || 0) + parseInt(exams?.high_exam_scores || 0);

    // Calculate XP (based on speaking, roleplay, quizzes, and exams)
    const totalXP = 
      Math.floor(totalPracticeTime / 60) * 2 +  // 2 XP per minute of practice
      fullSessions * 10 +                       // 10 XP per full session
      totalQuizzes * 15 +                       // 15 XP per quiz
      totalExams * 15 +                         // 15 XP per exam
      perfectScores * 25 +                      // 25 XP per perfect score
      highScores * 10 +                         // 10 XP per high score
      currentStreak * 5;                        // 5 XP per streak day

    const userLevel = Math.floor(totalXP / 100) + 1;
    const xpForNextLevel = userLevel * 100;
    const xpProgress = Math.round(((totalXP % 100) / 100) * 100);

    // Define badges
    const badges = [
      {
        id: 'streak_7',
        name: '7-Day Streak',
        description: 'Complete 7 consecutive days of speaking practice',
        icon: '🔥',
        unlocked: currentStreak >= 7,
        progress: Math.min(100, (currentStreak / 7) * 100),
      },
      {
        id: 'streak_30',
        name: '30-Day Streak',
        description: 'Complete 30 consecutive days of speaking practice',
        icon: '🏆',
        unlocked: currentStreak >= 30,
        progress: Math.min(100, (currentStreak / 30) * 100),
      },
      {
        id: 'perfect_score',
        name: 'Perfect Score',
        description: 'Get a perfect score on any quiz',
        icon: '⭐',
        unlocked: perfectScores > 0,
        progress: perfectScores > 0 ? 100 : 0,
      },
      {
        id: 'high_achiever',
        name: 'High Achiever',
        description: 'Get 5 scores of 80% or higher',
        icon: '🎯',
        unlocked: highScores >= 5,
        progress: Math.min(100, (highScores / 5) * 100),
      },
      {
        id: 'dedicated_learner',
        name: 'Dedicated Learner',
        description: 'Complete 20 practice sessions (100 minutes)',
        icon: '📚',
        unlocked: fullSessions >= 20,
        progress: Math.min(100, (fullSessions / 20) * 100),
      },
      {
        id: 'quiz_master',
        name: 'Exam Master',
        description: 'Complete 10 exams',
        icon: '🧠',
        unlocked: totalExams >= 10,
        progress: Math.min(100, (totalExams / 10) * 100),
      },
      {
        id: 'time_master',
        name: 'Time Master',
        description: 'Spend 5 hours total practice time',
        icon: '⏰',
        unlocked: totalPracticeTime >= 18000,
        progress: Math.min(100, (totalPracticeTime / 18000) * 100),
      },
    ];

    // Weekly exams list (for charts)
    const weeklyExamsResult = await db.query(
      `SELECT week_number, exam_score, exam_duration_seconds, exam_date, exam_completed
       FROM weekly_exams
       WHERE user_id = $1
       ORDER BY week_number ASC`,
      [userId]
    );

    const weeklyExamsRows = weeklyExamsResult?.rows || [];

    return {
      analytics: {
        course: {
          id: course.id,
          startDate: course.course_start_date,
          endDate: course.course_end_date,
          currentWeek: course.current_week,
          currentDay: course.current_day,
        },
        progress: {
          total_days: parseInt(stats?.total_days || 0),
          speaking_days: parseInt(stats?.speaking_days || 0),
          quiz_days: totalQuizzes,
          exam_days: totalExams,
          listening_days: parseInt(stats?.listening_days || 0),
          listening_quiz_days: parseInt(stats?.listening_quiz_days || 0),
          complete_days: parseInt(stats?.total_days || 0),
          current_streak: currentStreak,
          total_speaking_time: totalSpeakingTime,
          total_roleplay_time: totalRoleplayTime,
          total_practice_time: totalPracticeTime,
          avg_practice_time: totalPracticeTime > 0 && fullSessions > 0 ? Math.floor(totalPracticeTime / fullSessions) : 0,
          total_listening_time: 0,
          avg_listening_time: 0,
          avg_quiz_score: parseFloat(stats?.avg_speaking_quiz_score || 0),
          avg_exam_score: parseFloat(exams?.avg_exam_score || 0),
          avg_listening_quiz_score: parseFloat(stats?.avg_listening_quiz_score || 0),
          total_xp: totalXP,
        },
        // Keep legacy key naming expected by frontend charts/components
        weeklyExams: weeklyExamsRows.map((r) => ({
          week_number: Number(r.week_number),
          exam_score: r.exam_score ?? 0,
          exam_duration_seconds: r.exam_duration_seconds ?? 0,
          exam_date: r.exam_date,
          exam_completed: r.exam_completed === true,
        })),
        speakingSessions: [],
        monthlyTrends: [],
        skillTrends: [],
      },
      achievements: {
        badges,
        level: {
          current: userLevel,
          xp: totalXP,
          xpForNextLevel,
          xpProgress,
        },
        stats: {
          currentStreak,
          perfectScores,
          highScores,
          fullSessions,
          totalQuizzes,
          totalExams,
          examsPassed: totalExams,
          totalSpeakingTime,
          totalRoleplayTime,
          totalPracticeTime,
        },
      },
    };
  },

  /**
   * Complete weekly exam for the current week based on DAILY_PROGRESS + DAILY_REPORTS
   */
  async completeWeeklyExam(userId, date) {
    const targetDate = date ? toISODateString(date) : toISODateString(new Date());

    // Get the daily progress row for the exam day
    const progress = await db.queryOne(
      `SELECT * FROM daily_progress WHERE user_id = $1 AND progress_date = $2`,
      [userId, targetDate]
    );

    if (!progress) {
      throw new ValidationError('No daily progress found for exam day', 'date');
    }

    if (!progress.speaking_completed || !progress.speaking_quiz_completed) {
      throw new ValidationError('Exam day speaking and quiz must be completed before finishing exam', 'date');
    }

    // Optionally ensure a daily report exists for that date
    const report = await db.queryOne(
      `SELECT * FROM daily_reports WHERE user_id = $1 AND report_date = $2`,
      [userId, targetDate]
    );

    if (!report) {
      throw new ValidationError('Daily report not found for exam day', 'date');
    }

    // Determine course/week context from daily_progress
    const courseId = progress.course_id;
    const weekNumber = progress.week_number;

    if (!courseId || !weekNumber) {
      throw new ValidationError('Missing course/week context for exam day', 'date');
    }

    const examScore = progress.speaking_quiz_score || 0;
    const examDurationSeconds = progress.speaking_duration_seconds || 0;

    // Upsert weekly_exams row for this user/week
    const existing = await db.queryOne(
      `SELECT * FROM weekly_exams WHERE user_id = $1 AND course_id = $2 AND week_number = $3`,
      [userId, courseId, weekNumber]
    );

    let result;
    if (existing) {
      result = await db.queryOne(
        `UPDATE weekly_exams
         SET exam_completed = true,
             exam_score = $4,
             exam_duration_seconds = $5,
             exam_date = $6,
             updated_at = (NOW() AT TIME ZONE 'UTC')
         WHERE id = $7
         RETURNING *`,
        [userId, courseId, weekNumber, examScore, examDurationSeconds, targetDate, existing.id]
      );
    } else {
      result = await db.queryOne(
        `INSERT INTO weekly_exams (user_id, course_id, week_number, exam_date, exam_completed, exam_score, exam_duration_seconds, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, $5, $6, (NOW() AT TIME ZONE 'UTC'), (NOW() AT TIME ZONE 'UTC'))
         RETURNING *`,
        [userId, courseId, weekNumber, targetDate, examScore, examDurationSeconds]
      );
    }

    return { weeklyExam: result };
  },
};

module.exports = progressService;
