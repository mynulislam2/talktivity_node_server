// src/modules/course/service.js
// Course business logic

const db = require('../../core/db/client');
const listeningTopics = require('../../../listening-topics.js');

// Helper function to determine day type
const getDayType = (day) => {
  switch (day) {
    case 1:
    case 3:
    case 5:
      return "speaking";
    case 2:
    case 4:
      return "listening";
    case 6:
      return "quiz";
    case 7:
      return "exam";
    default:
      return "speaking";
  }
};

// Helper function to check if quiz is available
const isQuizAvailable = (dayType, todayProgress) => {
  return dayType === "quiz" && !(todayProgress && todayProgress.quiz_completed);
};

// Helper function to check if listening is available
const isListeningAvailable = (dayType, todayProgress) => {
  return dayType === "listening" && !(todayProgress && todayProgress.listening_completed);
};

// Helper function to check if listening quiz is available
const isListeningQuizAvailable = (dayType, todayProgress) => {
  return dayType === "listening" && 
         (todayProgress && todayProgress.listening_completed) && 
         !(todayProgress && todayProgress.listening_quiz_completed);
};

// Get current course status and today's progress
const getCourseStatus = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();

    const today = new Date().toISOString().split("T")[0];

    // Get user's active course
    const courseResult = await client.query(
      "SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true",
      [userId]
    );

    if (courseResult.rows.length === 0) {
      throw new Error("No active course found");
    }

    const course = courseResult.rows[0];

    // Get today's progress
    const progressResult = await client.query(
      "SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2",
      [userId, today]
    );

    const todayProgress = progressResult.rows[0] || null;

    // Calculate current week and day
    const courseStart = new Date(course.course_start_date);
    const daysSinceStart = Math.floor(
      (new Date() - courseStart) / (1000 * 60 * 60 * 24)
    );
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    const currentDay = (daysSinceStart % 7) + 1;

    // Sum all speaking session durations for today
    const sumResult = await client.query(
      "SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM speaking_sessions WHERE user_id = $1 AND date = $2",
      [userId, today]
    );
    const totalSeconds = parseInt(sumResult.rows[0].total_seconds, 10);
    const maxSeconds = 5 * 60;
    const timeRemaining = Math.max(0, maxSeconds - totalSeconds);
    
    // Determine what's available today
    const dayType = getDayType(currentDay);

    // speakingAvailable: true if timeRemaining > 0 and not marked completed
    const speakingAvailable =
      timeRemaining > 0 && !(todayProgress && todayProgress.speaking_completed);

    // Get today's personalized topic
    let todayTopic = null;
    if (course.personalized_topics && course.personalized_topics.length > 0) {
      const dayIndex = (currentWeek - 1) * 7 + (currentDay - 1);
      if (dayIndex < course.personalized_topics.length) {
        todayTopic = course.personalized_topics[dayIndex];
      }
    }

    // Get today's listening topic from the imported listening topics
    let todayListeningTopic = null;
    // Use the imported listening topics array for better variety
    const topicIndex = (currentDay - 1) % listeningTopics.length;
    todayListeningTopic = listeningTopics[topicIndex];

    return {
      course: {
        id: course.id,
        currentWeek: currentWeek,
        currentDay: currentDay,
        dayType: dayType,
        totalWeeks: 12,
        totalDays: 84,
        batchNumber: course.batch_number || 1,
        batchStatus: course.batch_status
          ? {
              action: course.batch_status.action,
              message: course.batch_status.message,
              batchNumber: course.batch_status.batch_number,
            }
          : undefined,
        todayTopic: todayTopic,
        todayListeningTopic: todayListeningTopic,
      },
      today: {
        date: today,
        progress: todayProgress,
        timeRemaining: timeRemaining,
        speakingAvailable: speakingAvailable,
        quizAvailable: isQuizAvailable(dayType, todayProgress),
        listeningAvailable: isListeningAvailable(dayType, todayProgress),
        listeningQuizAvailable: isListeningQuizAvailable(dayType, todayProgress),
      },
    };
  } finally {
    if (client) client.release();
  }
};

// Start speaking session
const startSpeakingSession = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();
    const today = new Date().toISOString().split("T")[0];

    // Get user's active course
    const courseResult = await client.query(
      "SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true",
      [userId]
    );
    if (courseResult.rows.length === 0) {
      throw new Error("No active course found");
    }
    const course = courseResult.rows[0];

    // Sum all speaking session durations for today
    const sumResult = await client.query(
      "SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM speaking_sessions WHERE user_id = $1 AND date = $2",
      [userId, today]
    );
    const totalSeconds = parseInt(sumResult.rows[0].total_seconds, 10);
    if (totalSeconds >= 5 * 60) {
      throw new Error("Daily speaking limit reached");
    }

    // Create a new speaking session (start_time only)
    const startTime = new Date();
    const sessionDate = startTime.toISOString().split("T")[0];
    await client.query(
      `INSERT INTO speaking_sessions (user_id, course_id, date, start_time) VALUES ($1, $2, $3, $4)`,
      [userId, course.id, sessionDate, startTime]
    );

    return {
      success: true,
      message: "Speaking session started",
      data: {
        startTime: new Date(),
        timeLimit: 5 * 60 - totalSeconds, // seconds left for today
      },
    };
  } finally {
    if (client) client.release();
  }
};

// End speaking session
const endSpeakingSession = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const endTime = new Date();

    // Find the most recent speaking session without an end_time
    const sessionResult = await client.query(
      `SELECT id, start_time FROM speaking_sessions 
       WHERE user_id = $1 AND end_time IS NULL 
       ORDER BY start_time DESC LIMIT 1`,
      [userId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error("No active speaking session found");
    }

    const session = sessionResult.rows[0];
    const startTime = new Date(session.start_time);
    const durationSeconds = Math.floor((endTime - startTime) / 1000);

    // Update the session with end_time and duration
    await client.query(
      `UPDATE speaking_sessions 
       SET end_time = $1, duration_seconds = $2 
       WHERE id = $3`,
      [endTime, durationSeconds, session.id]
    );

    // Update daily progress
    const sessionDate = startTime.toISOString().split("T")[0];
    const progressResult = await client.query(
      `SELECT id FROM daily_progress WHERE user_id = $1 AND date = $2`,
      [userId, sessionDate]
    );

    if (progressResult.rows.length > 0) {
      // Update existing progress
      await client.query(
        `UPDATE daily_progress 
         SET speaking_completed = true, updated_at = NOW() 
         WHERE id = $1`,
        [progressResult.rows[0].id]
      );
    } else {
      // Create new progress entry
      await client.query(
        `INSERT INTO daily_progress (user_id, date, speaking_completed) 
         VALUES ($1, $2, true)`,
        [userId, sessionDate]
      );
    }

    return {
      success: true,
      message: "Speaking session ended",
      data: {
        durationSeconds: durationSeconds,
        endTime: endTime,
      },
    };
  } finally {
    if (client) client.release();
  }
};

// Mark listening as completed
const completeListening = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();
    const today = new Date().toISOString().split("T")[0];

    // Update or create daily progress
    const progressResult = await client.query(
      `SELECT id FROM daily_progress WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );

    if (progressResult.rows.length > 0) {
      // Update existing progress
      await client.query(
        `UPDATE daily_progress 
         SET listening_completed = true, updated_at = NOW() 
         WHERE id = $1`,
        [progressResult.rows[0].id]
      );
    } else {
      // Create new progress entry
      await client.query(
        `INSERT INTO daily_progress (user_id, date, listening_completed) 
         VALUES ($1, $2, true)`,
        [userId, today]
      );
    }

    return {
      success: true,
      message: "Listening marked as completed",
    };
  } finally {
    if (client) client.release();
  }
};

// Mark quiz as completed
const completeQuiz = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();
    const today = new Date().toISOString().split("T")[0];

    // Update or create daily progress
    const progressResult = await client.query(
      `SELECT id FROM daily_progress WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );

    if (progressResult.rows.length > 0) {
      // Update existing progress
      await client.query(
        `UPDATE daily_progress 
         SET quiz_completed = true, updated_at = NOW() 
         WHERE id = $1`,
        [progressResult.rows[0].id]
      );
    } else {
      // Create new progress entry
      await client.query(
        `INSERT INTO daily_progress (user_id, date, quiz_completed) 
         VALUES ($1, $2, true)`,
        [userId, today]
      );
    }

    return {
      success: true,
      message: "Quiz marked as completed",
    };
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getCourseStatus,
  startSpeakingSession,
  endSpeakingSession,
  completeListening,
  completeQuiz
};