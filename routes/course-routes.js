const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const listeningTopics = require('../listening-topics');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-default-secret-key', (err, user) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    
    // Map userId to id for consistency
    req.user = {
      id: user.userId,
      email: user.email
    };
    next();
  });
};

// Initialize course for a new user (3 months = 12 weeks)
router.post('/courses/initialize', authenticateToken, async (req, res) => {
  let client;
  try {
    console.log('Course initialization request for user:', req.user);
    client = await db.pool.connect();
    
    const userId = req.user.id;
    console.log('User ID:', userId);

    // Check if user already has an active course with personalized topics
    const existingCourse = await client.query(
      `SELECT * FROM user_courses 
       WHERE user_id = $1 AND is_active = true 
       AND personalized_topics IS NOT NULL 
       AND jsonb_array_length(personalized_topics) > 0`,
      [userId]
    );

    if (existingCourse.rows.length > 0) {
      // Already has a valid personalized course, return it
      return res.status(200).json({
        success: true,
        data: {
          ...existingCourse.rows[0],
          personalizedTopicsCount: existingCourse.rows[0].personalized_topics.length
        },
        message: 'Personalized course already exists'
      });
    }
    
    // Deactivate all previous active courses for this user
    await client.query(
      'UPDATE user_courses SET is_active = false WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    // Remove any course for this user that has no personalized topics (cleanup bad state)
    await client.query(
      `DELETE FROM user_courses WHERE user_id = $1 AND (personalized_topics IS NULL OR jsonb_array_length(personalized_topics) = 0)`,
      [userId]
    );

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 84); // 12 weeks * 7 days = 84 days

    // Get user's onboarding data directly by user ID
    const onboardingResult = await client.query(
      'SELECT * FROM onboarding_data WHERE user_id = $1',
      [userId]
    );
    
    const conversationResult = await client.query(
      'SELECT transcript FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5',
      [userId]
    );

    let personalizedTopics = [];

    // Only proceed if onboarding data exists
    if (onboardingResult.rows.length > 0) {
      try {
        const onboardingData = onboardingResult.rows[0];
        const conversations = conversationResult.rows.map(row => row.transcript); // may be empty
        personalizedTopics = await generatePersonalizedCourse(onboardingData, conversations);
        console.log('Personalized course generated with', personalizedTopics.length, 'topics');
      } catch (error) {
        console.error('Error generating personalized course:', error);
        // If generation fails, do not create a course
        return res.status(400).json({
          success: false,
          error: 'Failed to generate personalized course. Please complete onboarding and try again.'
        });
      }
    } else {
      // No onboarding data, do not create a course
      return res.status(400).json({
        success: false,
        error: 'Onboarding data not found. Please complete onboarding first.'
      });
    }

    // Only create course if personalized topics are generated
    if (!personalizedTopics || personalizedTopics.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Personalized topics could not be generated. Please retry after completing onboarding.'
      });
    }

    // Create new course with personalized topics
    const result = await client.query(
      `INSERT INTO user_courses (user_id, course_start_date, course_end_date, current_week, current_day, is_active, personalized_topics)
       VALUES ($1, $2, $3, 1, 1, true, $4)
       RETURNING *`,
      [userId, startDate, endDate, JSON.stringify(personalizedTopics)]
    );

    console.log('Course created successfully:', result.rows[0]);
    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        personalizedTopicsCount: personalizedTopics.length
      }
    });

  } catch (error) {
    console.error('Error initializing course:', error);
    
    // Check if it's a foreign key constraint error (user doesn't exist)
    if (error.code === '23503' && error.constraint === 'user_courses_user_id_fkey') {
      return res.status(404).json({
        success: false,
        error: 'User not found. Please log out and log back in to refresh your session.',
        code: 'USER_NOT_FOUND'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to initialize course'
    });
  } finally {
    if (client) client.release();
  }
});

// Get current course status and today's progress
router.get('/courses/status', authenticateToken, async (req, res) => {
  let client;
  try {
    console.log('Course status request for user:', req.user);
    client = await db.pool.connect();
    
    const userId = req.user.id;
    console.log('User ID:', userId);
    const today = new Date().toISOString().split('T')[0];

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      console.log('No active course found for user:', userId);
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Get today's progress
    const progressResult = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const todayProgress = progressResult.rows[0] || null;

    // Calculate current week and day
    const courseStart = new Date(course.course_start_date);
    const daysSinceStart = Math.floor((new Date() - courseStart) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    const currentDay = (daysSinceStart % 7) + 1;

    // Note: Batch generation is now triggered by Day 7 completion in completion endpoints
    // This automatic check has been removed to prevent continuous progression checking

    // Sum all speaking session durations for today
    const sumResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM speaking_sessions WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    const totalSeconds = parseInt(sumResult.rows[0].total_seconds, 10);
    const maxSeconds = 5 * 60;
    const timeRemaining = Math.max(0, maxSeconds - totalSeconds);
    // Determine what's available today
    const dayType = getDayType(currentDay);
    
    // speakingAvailable: true if timeRemaining > 0 and not marked completed
    const speakingAvailable = timeRemaining > 0 && !(todayProgress && todayProgress.speaking_completed);

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

    res.json({
      success: true,
      data: {
        course: {
          id: course.id,
          currentWeek: currentWeek,
          currentDay: currentDay,
          dayType: dayType,
          totalWeeks: 12,
          totalDays: 84,
          batchNumber: course.batch_number || 1,
          batchStatus: course.batch_status ? {
            action: course.batch_status.action,
            message: course.batch_status.message,
            batchNumber: course.batch_status.batch_number
          } : undefined,
          todayTopic: todayTopic,
          todayListeningTopic: todayListeningTopic
        },
        today: {
          date: today,
          progress: todayProgress,
          timeRemaining: timeRemaining,
          speakingAvailable: speakingAvailable,
          quizAvailable: isQuizAvailable(dayType, todayProgress),
          listeningAvailable: isListeningAvailable(dayType, todayProgress),
          listeningQuizAvailable: isListeningQuizAvailable(dayType, todayProgress)
        }
      }
    });

  } catch (error) {
    console.error('Error getting course status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get course status'
    });
  } finally {
    if (client) client.release();
  }
});

// Start speaking session
router.post('/courses/speaking/start', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No active course found' });
    }
    const course = courseResult.rows[0];

    // Sum all speaking session durations for today
    const sumResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM speaking_sessions WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    const totalSeconds = parseInt(sumResult.rows[0].total_seconds, 10);
    if (totalSeconds >= 5 * 60) {
      return res.status(400).json({ success: false, error: 'Daily speaking limit reached' });
    }

    // Create a new speaking session (start_time only)
    const startTime = new Date();
    const sessionDate = startTime.toISOString().split('T')[0];
    await client.query(
      `INSERT INTO speaking_sessions (user_id, course_id, date, start_time) VALUES ($1, $2, $3, $4)`,
      [userId, course.id, sessionDate, startTime]
    );

    res.json({
      success: true,
      message: 'Speaking session started',
      data: {
        startTime: new Date(),
        timeLimit: 5 * 60 - totalSeconds // seconds left for today
      }
    });
  } catch (error) {
    console.error('Error starting speaking session:', error);
    res.status(500).json({ success: false, error: 'Failed to start speaking session' });
  } finally {
    if (client) client.release();
  }
});

// End speaking session
router.post('/courses/speaking/end', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Find the latest speaking session for today that has no end_time
    const sessionResult = await client.query(
      'SELECT * FROM speaking_sessions WHERE user_id = $1 AND date = $2 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
      [userId, today]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No active speaking session found' });
    }
    const session = sessionResult.rows[0];
    const endTime = new Date();
    const startTime = new Date(session.start_time);
    let durationSeconds = Math.floor((endTime - startTime) / 1000);
    if (durationSeconds < 0) durationSeconds = 0;

    // Update session with end_time and duration
    await client.query(
      `UPDATE speaking_sessions SET end_time = $1, duration_seconds = $2, updated_at = $1 WHERE id = $3`,
      [endTime, durationSeconds, session.id]
    );

    // Sum all durations for today
    const sumResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM speaking_sessions WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    const totalSeconds = parseInt(sumResult.rows[0].total_seconds, 10);
    
    // If total >= 5 min, mark daily_progress.speaking_completed = true
    if (totalSeconds >= 5 * 60) {
      // Get user's active course
      const courseResult = await client.query(
        'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      
      if (courseResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'No active course found' });
      }
      
      const course = courseResult.rows[0];
      
      // Upsert daily_progress with proper week/day calculation
      const courseStart = new Date(course.course_start_date);
      const daysSinceStart = Math.floor((new Date() - courseStart) / (1000 * 60 * 60 * 24));
      const currentWeek = Math.floor(daysSinceStart / 7) + 1;
      const currentDay = (daysSinceStart % 7) + 1;
      
      await client.query(
        `INSERT INTO daily_progress (user_id, course_id, week_number, day_number, date, speaking_completed, speaking_duration_seconds)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (user_id, date) DO UPDATE SET 
           speaking_completed = true, 
           speaking_end_time = NOW(),
           speaking_duration_seconds = $6`,
        [userId, course.id, currentWeek, currentDay, today, totalSeconds]
      );

      // Check if this is the last day of the current batch and trigger next batch generation
      await checkAndTriggerNextBatch(client, userId, currentDay, currentWeek);
    }
    res.json({
      success: true,
      message: 'Speaking session ended',
      data: {
        duration: durationSeconds,
        totalSpoken: totalSeconds,
        completed: totalSeconds >= 5 * 60
      }
    });
  } catch (error) {
    console.error('Error ending speaking session:', error);
    res.status(500).json({ success: false, error: 'Failed to end speaking session' });
  } finally {
    if (client) client.release();
  }
});

    // Check speaking time limit and auto-complete if needed
router.post('/courses/speaking/check-time', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get today's progress
    const progressResult = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (progressResult.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          timeRemaining: 5 * 60,
          shouldAutoComplete: false
        }
      });
    }

    const progress = progressResult.rows[0];
    
    if (progress.speaking_completed) {
      return res.json({
        success: true,
        data: {
          timeRemaining: 0,
          shouldAutoComplete: false
        }
      });
    }

    // Find the latest active speaking session for today
    const sessionResult = await client.query(
      'SELECT start_time FROM speaking_sessions WHERE user_id = $1 AND date = $2 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
      [userId, today]
    );

    if (sessionResult.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          timeRemaining: 5 * 60,
          shouldAutoComplete: false
        }
      });
    }

    // Calculate time remaining based on actual session start time
    const startTime = new Date(sessionResult.rows[0].start_time);
    const now = new Date();
    const elapsed = Math.floor((now - startTime) / 1000);
    const timeRemaining = Math.max(0, (5 * 60) - elapsed);
    const shouldAutoComplete = timeRemaining <= 0;

    // Auto-complete if time is up
    if (shouldAutoComplete && !progress.speaking_completed) {
      // End the current session
      await client.query(
        `UPDATE speaking_sessions 
         SET end_time = NOW(), duration_seconds = $1, updated_at = NOW()
         WHERE user_id = $2 AND date = $3 AND end_time IS NULL`,
        [5 * 60, userId, today]
      );

      // Mark speaking as completed in daily_progress
      await client.query(
        `UPDATE daily_progress 
         SET speaking_completed = true, speaking_end_time = NOW(), speaking_duration_seconds = $1
         WHERE user_id = $2 AND date = $3`,
        [5 * 60, userId, today]
      );
    }

    res.json({
      success: true,
      data: {
        timeRemaining: timeRemaining,
        shouldAutoComplete: shouldAutoComplete,
        autoCompleted: shouldAutoComplete
      }
    });

  } catch (error) {
    console.error('Error checking speaking time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check speaking time'
    });
  } finally {
    if (client) client.release();
  }
});

// User-based speaking session endpoints (for authenticated users)
// Start user speaking session
router.post('/courses/user-speaking/start', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    
    const today = new Date().toISOString().split('T')[0];

    // Check lifetime limit (5 minutes total for user)
    const lifetimeResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM device_speaking_sessions WHERE user_id = $1',
      [userId]
    );
    const lifetimeSeconds = parseInt(lifetimeResult.rows[0].total_seconds, 10);
    
    if (lifetimeSeconds >= 5 * 60) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lifetime speaking limit reached for this user',
        data: { lifetimeLimitReached: true }
      });
    }

    // Check daily limit (5 minutes per day)
    const dailyResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM device_speaking_sessions WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    const dailySeconds = parseInt(dailyResult.rows[0].total_seconds, 10);
    
    if (dailySeconds >= 5 * 60) {
      return res.status(400).json({ 
        success: false, 
        error: 'Daily speaking limit reached for this user',
        data: { dailyLimitReached: true }
      });
    }

    // Create a new user speaking session
    const startTime = new Date();
    const sessionDate = startTime.toISOString().split('T')[0];
    await client.query(
      `INSERT INTO device_speaking_sessions (user_id, date, start_time) VALUES ($1, $2, $3)`,
      [userId, sessionDate, startTime]
    );

    res.json({
      success: true,
      message: 'User speaking session started',
      data: {
        startTime: new Date(),
        dailyTimeRemaining: 5 * 60 - dailySeconds,
        lifetimeTimeRemaining: 5 * 60 - lifetimeSeconds
      }
    });
  } catch (error) {
    console.error('Error starting user speaking session:', error);
    res.status(500).json({ success: false, error: 'Failed to start user speaking session' });
  } finally {
    if (client) client.release();
  }
});

// End user speaking session
router.post('/courses/user-speaking/end', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    
    const today = new Date().toISOString().split('T')[0];

    // Find the latest user speaking session for today that has no end_time
    const sessionResult = await client.query(
      'SELECT * FROM device_speaking_sessions WHERE user_id = $1 AND date = $2 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
      [userId, today]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No active user speaking session found' });
    }
    
    const session = sessionResult.rows[0];
    const endTime = new Date();
    const startTime = new Date(session.start_time);
    let durationSeconds = Math.floor((endTime - startTime) / 1000);
    if (durationSeconds < 0) durationSeconds = 0;

    // Update session with end_time and duration
    await client.query(
      `UPDATE device_speaking_sessions SET end_time = $1, duration_seconds = $2, updated_at = $1 WHERE id = $3`,
      [endTime, durationSeconds, session.id]
    );

    // Calculate totals
    const dailyResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM device_speaking_sessions WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    const dailySeconds = parseInt(dailyResult.rows[0].total_seconds, 10);

    const lifetimeResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM device_speaking_sessions WHERE user_id = $1',
      [userId]
    );
    const lifetimeSeconds = parseInt(lifetimeResult.rows[0].total_seconds, 10);

    res.json({
      success: true,
      message: 'User speaking session ended',
      data: {
        duration: durationSeconds,
        dailyTotal: dailySeconds,
        lifetimeTotal: lifetimeSeconds,
        dailyCompleted: dailySeconds >= 5 * 60,
        lifetimeCompleted: lifetimeSeconds >= 5 * 60
      }
    });
  } catch (error) {
    console.error('Error ending user speaking session:', error);
    res.status(500).json({ success: false, error: 'Failed to end user speaking session' });
  } finally {
    if (client) client.release();
  }
});

// Check user speaking time limit
router.post('/courses/user-speaking/check-time', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    
    const today = new Date().toISOString().split('T')[0];

    // Get current session
    const sessionResult = await client.query(
      'SELECT * FROM device_speaking_sessions WHERE user_id = $1 AND date = $2 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
      [userId, today]
    );

    if (sessionResult.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          timeRemaining: 5 * 60,
          shouldAutoComplete: false
        }
      });
    }

    const session = sessionResult.rows[0];
    const startTime = new Date(session.start_time);
    const now = new Date();
    const elapsed = Math.floor((now - startTime) / 1000);
    const timeRemaining = Math.max(0, (5 * 60) - elapsed);
    const shouldAutoComplete = timeRemaining <= 0;

    // Auto-complete if time is up
    if (shouldAutoComplete) {
      await client.query(
        `UPDATE device_speaking_sessions 
         SET end_time = NOW(), duration_seconds = $1, updated_at = NOW()
         WHERE id = $2`,
        [5 * 60, session.id]
      );
    }

    res.json({
      success: true,
      data: {
        timeRemaining: timeRemaining,
        shouldAutoComplete: shouldAutoComplete,
        autoCompleted: shouldAutoComplete
      }
    });

  } catch (error) {
    console.error('Error checking user speaking time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check user speaking time'
    });
  } finally {
    if (client) client.release();
  }
});

// Get user speaking status
router.post('/courses/user-speaking/status', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    
    const today = new Date().toISOString().split('T')[0];

    // Get daily total
    const dailyResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM device_speaking_sessions WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    const dailySeconds = parseInt(dailyResult.rows[0].total_seconds, 10);

    // Get lifetime total
    const lifetimeResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM device_speaking_sessions WHERE user_id = $1',
      [userId]
    );
    const lifetimeSeconds = parseInt(lifetimeResult.rows[0].total_seconds, 10);

    res.json({
      success: true,
      data: {
        dailyTotal: dailySeconds,
        lifetimeTotal: lifetimeSeconds,
        dailyAvailable: dailySeconds < 5 * 60,
        lifetimeAvailable: lifetimeSeconds < 5 * 60,
        dailyRemaining: Math.max(0, 5 * 60 - dailySeconds),
        lifetimeRemaining: Math.max(0, 5 * 60 - lifetimeSeconds)
      }
    });

  } catch (error) {
    console.error('Error getting user speaking status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user speaking status'
    });
  } finally {
    if (client) client.release();
  }
});

// Complete quiz
router.post('/courses/quiz/complete', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const userId = req.user.id;
    const { score } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Get today's progress
    let progressResult = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    // If no progress row exists (e.g., Day 6 quiz-only), create it first
    if (progressResult.rows.length === 0) {
      // Get user's active course
      const courseResult = await client.query(
        'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (courseResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'No active course found' });
      }

      const course = courseResult.rows[0];
      const courseStart = new Date(course.course_start_date);
      const daysSinceStart = Math.floor((new Date() - courseStart) / (1000 * 60 * 60 * 24));
      const currentWeek = Math.floor(daysSinceStart / 7) + 1;
      const currentDay = (daysSinceStart % 7) + 1;

      await client.query(
        `INSERT INTO daily_progress (user_id, course_id, week_number, day_number, date)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, course.id, currentWeek, currentDay, today]
      );

      // Re-fetch progress after insert
      progressResult = await client.query(
        'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
        [userId, today]
      );
    }

    const progress = progressResult.rows[0];

    // Update quiz completion
    await client.query(
      `UPDATE daily_progress 
       SET quiz_completed = true, quiz_score = $1, quiz_attempts = quiz_attempts + 1
       WHERE user_id = $2 AND date = $3`,
      [score, userId, today]
    );

    // Check if this is the last day of the current batch and trigger next batch generation
    await checkAndTriggerNextBatch(client, userId, progress.day_number, progress.week_number);

    res.json({
      success: true,
      message: 'Quiz completed',
      data: {
        score: score,
        completed: true
      }
    });

  } catch (error) {
    console.error('Error completing quiz:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete quiz'
    });
  } finally {
    if (client) client.release();
  }
});

// Start listening session
router.post('/courses/listening/start', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Get or create today's progress
    let progressResult = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (progressResult.rows.length === 0) {
      // Create new progress record
      const courseStart = new Date(course.course_start_date);
      const daysSinceStart = Math.floor((new Date() - courseStart) / (1000 * 60 * 60 * 24));
      const currentWeek = Math.floor(daysSinceStart / 7) + 1;
      const currentDay = (daysSinceStart % 7) + 1;

      await client.query(
        `INSERT INTO daily_progress (user_id, course_id, week_number, day_number, date, listening_start_time)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, course.id, currentWeek, currentDay, today]
      );
    } else {
      // Update existing progress with start time
      await client.query(
        `UPDATE daily_progress 
         SET listening_start_time = NOW()
         WHERE user_id = $1 AND date = $2`,
        [userId, today]
      );
    }

    res.json({
      success: true,
      message: 'Listening session started',
      data: {
        started: true
      }
    });

  } catch (error) {
    console.error('Error starting listening session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start listening session'
    });
  } finally {
    if (client) client.release();
  }
});

// Complete listening
router.post('/courses/listening/complete', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get today's progress
    const progressResult = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (progressResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No daily progress found'
      });
    }

    const progress = progressResult.rows[0];

    // Calculate listening duration if start time exists
    let durationSeconds = 0;
    if (progress.listening_start_time) {
      const startTime = new Date(progress.listening_start_time);
      const endTime = new Date();
      durationSeconds = Math.floor((endTime - startTime) / 1000);
    }

    // Update listening completion
    await client.query(
      `UPDATE daily_progress 
       SET listening_completed = true, listening_end_time = NOW(), listening_duration_seconds = $1
       WHERE user_id = $2 AND date = $3`,
      [durationSeconds, userId, today]
    );

    // Check if this is the last day of the current batch and trigger next batch generation
    await checkAndTriggerNextBatch(client, userId, progress.day_number, progress.week_number);

    res.json({
      success: true,
      message: 'Listening completed',
      data: {
        completed: true,
        durationSeconds: durationSeconds
      }
    });

  } catch (error) {
    console.error('Error completing listening:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete listening'
    });
  } finally {
    if (client) client.release();
  }
});

// Complete listening quiz
router.post('/courses/listening-quiz/complete', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const userId = req.user.id;
    const { score } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Get today's progress
    const progressResult = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (progressResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No daily progress found'
      });
    }

    const progress = progressResult.rows[0];

    // Update listening quiz completion
    await client.query(
      `UPDATE daily_progress 
       SET listening_quiz_completed = true, listening_quiz_score = $1, listening_quiz_attempts = listening_quiz_attempts + 1
       WHERE user_id = $2 AND date = $3`,
      [score, userId, today]
    );

    // Check if this is the last day of the current batch and trigger next batch generation
    await checkAndTriggerNextBatch(client, userId, progress.day_number, progress.week_number);

    res.json({
      success: true,
      message: 'Listening quiz completed',
      data: {
        score: score,
        completed: true
      }
    });

  } catch (error) {
    console.error('Error completing listening quiz:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete listening quiz'
    });
  } finally {
    if (client) client.release();
  }
});

// Complete weekly exam
router.post('/courses/exam/complete', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const userId = req.user.id;
    const { score, weekNumber } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Check if exam already exists for this week
    const examResult = await client.query(
      'SELECT * FROM weekly_exams WHERE user_id = $1 AND week_number = $2',
      [userId, weekNumber]
    );

    if (examResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Weekly exam already completed'
      });
    }

    // Create weekly exam record
    await client.query(
      `INSERT INTO weekly_exams (user_id, course_id, week_number, exam_date, exam_completed, exam_score)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [userId, course.id, weekNumber, today, score]
    );

    res.json({
      success: true,
      message: 'Weekly exam completed',
      data: {
        weekNumber: weekNumber,
        score: score,
        completed: true
      }
    });

  } catch (error) {
    console.error('Error completing weekly exam:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete weekly exam'
    });
  } finally {
    if (client) client.release();
  }
});

// Get course progress summary
router.get('/courses/progress', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const userId = req.user.id;

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Get overall progress statistics
    const progressStats = await client.query(
      `SELECT 
         COUNT(*) as total_days,
         COUNT(CASE WHEN speaking_completed = true THEN 1 END) as speaking_days,
         COUNT(CASE WHEN quiz_completed = true THEN 1 END) as quiz_days,
         COUNT(CASE WHEN listening_completed = true THEN 1 END) as listening_days,
         COUNT(CASE WHEN listening_quiz_completed = true THEN 1 END) as listening_quiz_days,
         COUNT(
           CASE WHEN (
             (day_number BETWEEN 1 AND 5 AND speaking_completed AND quiz_completed AND listening_completed AND listening_quiz_completed)
             OR (day_number = 6 AND quiz_completed)
             OR (day_number = 7 AND speaking_completed)
           ) THEN 1 END
         ) as complete_days,
         AVG(quiz_score) as avg_quiz_score,
         AVG(listening_quiz_score) as avg_listening_quiz_score
       FROM daily_progress 
       WHERE user_id = $1 AND course_id = $2`,
      [userId, course.id]
    );

    // Get weekly exam results
    const examResults = await client.query(
      `SELECT week_number, exam_score, exam_date
       FROM weekly_exams 
       WHERE user_id = $1 AND course_id = $2
       ORDER BY week_number`,
      [userId, course.id]
    );

    res.json({
      success: true,
      data: {
        course: {
          id: course.id,
          startDate: course.course_start_date,
          endDate: course.course_end_date,
          currentWeek: course.current_week,
          currentDay: course.current_day
        },
        progress: progressStats.rows[0],
        weeklyExams: examResults.rows
      }
    });

  } catch (error) {
    console.error('Error getting course progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get course progress'
    });
  } finally {
    if (client) client.release();
  }
});

// GET all speaking sessions for a user in a specific month and year
router.get('/courses/speaking/sessions-by-month', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Month and year are required as query parameters'
      });
    }
    const monthInt = parseInt(month);
    const yearInt = parseInt(year);
    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month or year'
      });
    }

    // Query for speaking sessions in the given month and year
    const sessionsResult = await client.query(`
      SELECT * FROM speaking_sessions
      WHERE user_id = $1
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
      ORDER BY date DESC
    `, [userId, monthInt, yearInt]);

    res.json({
      success: true,
      data: {
        sessions: sessionsResult.rows,
        month: monthInt,
        year: yearInt
      }
    });
  } catch (error) {
    console.error('Error fetching speaking sessions by month:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (client) client.release();
  }
});

// GET all quiz and exam results for a user in a specific month and year
router.get('/courses/results-by-month', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Month and year are required as query parameters'
      });
    }
    const monthInt = parseInt(month);
    const yearInt = parseInt(year);
    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month or year'
      });
    }

    // Query for quiz results (daily_progress) in the given month and year
    const quizResults = await client.query(`
      SELECT * FROM daily_progress
      WHERE user_id = $1
        AND quiz_completed = true
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
      ORDER BY date DESC
    `, [userId, monthInt, yearInt]);

    // Query for exam results (weekly_exams) in the given month and year
    const examResults = await client.query(`
      SELECT * FROM weekly_exams
      WHERE user_id = $1
        AND EXTRACT(MONTH FROM exam_date) = $2
        AND EXTRACT(YEAR FROM exam_date) = $3
      ORDER BY week_number
    `, [userId, monthInt, yearInt]);

    res.json({
      success: true,
      data: {
        quizzes: quizResults.rows,
        exams: examResults.rows,
        month: monthInt,
        year: yearInt
      }
    });
  } catch (error) {
    console.error('Error fetching results by month:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (client) client.release();
  }
});

// GET monthly report with AI analysis
router.get('/reports/monthly', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Month and year are required as query parameters'
      });
    }
    const monthInt = parseInt(month);
    const yearInt = parseInt(year);
    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month or year'
      });
    }

    // Fetch all conversations for the month
    const conversationsResult = await client.query(`
      SELECT id, room_name, user_id, timestamp, transcript
      FROM conversations
      WHERE user_id = $1
        AND EXTRACT(MONTH FROM timestamp) = $2
        AND EXTRACT(YEAR FROM timestamp) = $3
      ORDER BY timestamp DESC
    `, [userId, monthInt, yearInt]);
    const conversations = conversationsResult.rows;

    // Fetch all speaking sessions for the month
    const sessionsResult = await client.query(`
      SELECT * FROM speaking_sessions
      WHERE user_id = $1
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
      ORDER BY date DESC
    `, [userId, monthInt, yearInt]);
    const sessions = sessionsResult.rows;

    // Fetch all listening sessions for the month
    const listeningSessionsResult = await client.query(`
      SELECT * FROM daily_progress
      WHERE user_id = $1
        AND listening_completed = true
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
      ORDER BY date DESC
    `, [userId, monthInt, yearInt]);
    const listeningSessions = listeningSessionsResult.rows;

    // Fetch all quiz results for the month
    const quizResults = await client.query(`
      SELECT * FROM daily_progress
      WHERE user_id = $1
        AND quiz_completed = true
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
      ORDER BY date DESC
    `, [userId, monthInt, yearInt]);
    const quizzes = quizResults.rows;

    // Fetch all listening quiz results for the month
    const listeningQuizResults = await client.query(`
      SELECT * FROM daily_progress
      WHERE user_id = $1
        AND listening_quiz_completed = true
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
      ORDER BY date DESC
    `, [userId, monthInt, yearInt]);
    const listeningQuizzes = listeningQuizResults.rows;

    // Fetch all exam results for the month
    const examResults = await client.query(`
      SELECT * FROM weekly_exams
      WHERE user_id = $1
        AND EXTRACT(MONTH FROM exam_date) = $2
        AND EXTRACT(YEAR FROM exam_date) = $3
      ORDER BY week_number
    `, [userId, monthInt, yearInt]);
    const exams = examResults.rows;

    // --- AI Analysis with Groq (use quiz page style and API key) ---
    let aiAnalysis;
    try {
      // Build allMessages as in quiz page
      let allMessages = [];
      for (const conv of conversations) {
        let transcript = conv.transcript;
        if (typeof transcript === 'string') {
          try { transcript = JSON.parse(transcript); } catch {}
        }
        if (Array.isArray(transcript)) {
          for (const item of transcript) {
            if (item.type === 'message' && item.content) {
              allMessages.push({
                role: item.role || 'user',
                content: Array.isArray(item.content) ? item.content.join(' ') : item.content
              });
            }
          }
        }
      }
      
      // If no conversation data available, provide fallback analysis
      if (allMessages.length === 0) {
        console.log('No conversation data available for AI analysis, using fallback');
        aiAnalysis = {
          fluency: 70,
          vocabulary: 80,
          grammar: 72,
          feedback: 'No conversation data available for this month. Keep practicing to get personalized feedback!'
        };
      } else {
                const formattedMessages = [
          {
            role: 'system',
            content: `Analyze the following English conversation data and return a JSON object with these properties:\n- fluency: 0-100\n- vocabulary: 0-100\n- grammar: 0-100\n- feedback: 1-2 sentences of constructive feedback\n\nBase your analysis ONLY on the provided conversation turns. IMPORTANT: Return ONLY a valid JSON object. Do not include any explanatory text or markdown formatting. The response should start with '{' and end with '}'.`
          },
          ...allMessages
        ];
        const payload = {
          model: 'llama3-8b-8192',
          messages: formattedMessages,
          temperature: 0.7,
          max_tokens: 1024
        };
        // Use the same API key as in the quiz page
        const headers = {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        };
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const response = await axios.post(url, payload, { headers });
        if (response.data.choices && response.data.choices.length > 0) {
          const contentString = response.data.choices[0].message.content;
          
          // Try to extract JSON from the response
          try {
            // First try direct JSON parsing
            aiAnalysis = JSON.parse(contentString);
          } catch (parseError) {
            // If direct parsing fails, try to extract JSON from the text
            const jsonMatch = contentString.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                aiAnalysis = JSON.parse(jsonMatch[0]);
              } catch (extractError) {
                console.error('Failed to extract JSON from response:', extractError);
                throw new Error('Invalid JSON format in AI response');
              }
            } else {
              console.error('No JSON found in response:', contentString);
              throw new Error('No JSON found in AI response');
            }
          }
        } else {
          throw new Error('No response content from Groq API');
        }
      }
    } catch (error) {
      aiAnalysis = {
        fluency: Math.floor(Math.random() * 100),
        vocabulary: Math.floor(Math.random() * 100),
        grammar: Math.floor(Math.random() * 100),
        feedback: 'This is a fallback. Groq API call failed.'
      };
      console.error('Groq AI Analysis error:', error);
    }

    res.json({
      success: true,
      data: {
        month: monthInt,
        year: yearInt,
        conversations,
        sessions,
        listeningSessions,
        quizzes,
        listeningQuizzes,
        exams,
        aiAnalysis
      }
    });
  } catch (error) {
    console.error('Error generating monthly report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (client) client.release();
  }
});

// POST /api/courses/generate-personalized
router.post('/courses/generate-personalized', authenticateToken, async (req, res) => {
  let client;
  try {
    const userId = req.user.id;
    
    client = await db.pool.connect();
    
    // Get user's onboarding data directly by user ID
    const onboardingResult = await client.query(
      'SELECT * FROM onboarding_data WHERE user_id = $1',
      [userId]
    );
    
    if (onboardingResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Onboarding data not found. Please complete onboarding first.'
      });
    }
    
    const onboardingData = onboardingResult.rows[0];
    
    // Get user's conversation history
    const conversationResult = await client.query(
      'SELECT transcript FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5',
      [userId]
    );
    
    const conversations = conversationResult.rows.map(row => row.transcript);
    

    
    // Generate personalized course using Groq AI
    const personalizedCourse = await generatePersonalizedCourse(onboardingData, conversations);
    
    // Save the personalized course
    const courseResult = await client.query(`
      INSERT INTO user_courses (user_id, course_start_date, course_end_date, current_week, current_day, is_active, personalized_topics)
      VALUES ($1, $2, $3, 1, 1, true, $4)
      RETURNING *
    `, [
      userId,
      new Date(),
      new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)), // 90 days from now
      JSON.stringify(personalizedCourse)
    ]);
    
    res.json({
      success: true,
      message: 'Personalized course generated successfully',
      data: {
        courseId: courseResult.rows[0].id,
        topics: personalizedCourse
      }
    });
    
  } catch (error) {
    console.error('Error generating personalized course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate personalized course'
    });
  } finally {
    if (client) client.release();
  }
});

// Helper function to generate personalized course using Groq AI
async function generatePersonalizedCourse(onboardingData, conversations, retryCount = 0) {
  const axios = require('axios');
  
  // Format the data for Groq AI
  const contextData = {
    onboarding: {
      skillToImprove: onboardingData.skill_to_improve,
      currentLevel: onboardingData.current_level,
      nativeLanguage: onboardingData.native_language,
      industry: onboardingData.industry,
      interests: onboardingData.interests,

      mainGoal: onboardingData.main_goal,
      speakingFeelings: onboardingData.speaking_feelings,
      speakingFrequency: onboardingData.speaking_frequency,
      currentLearningMethods: onboardingData.current_learning_methods,
      knownWords1: onboardingData.known_words_1,
      knownWords2: onboardingData.known_words_2,
      englishStyle: onboardingData.english_style,
      tutorStyle: onboardingData.tutor_style
    },
    conversations: conversations
  };

  const strictJsonWarning = retryCount === 0
    ? 'IMPORTANT: Return ONLY a valid JSON array of exactly 7 topic objects. Do NOT include any explanations, markdown, or extra text. The response MUST start with [ and end with ].'
    : 'RETRY: Return ONLY a valid JSON array of exactly 7 topic objects. Absolutely NO explanations, markdown, or extra text. Only the JSON array.';

  const messages = [
    {
      role: 'system',
      content: `You are an expert English language curriculum designer.

The user is Bangladeshi (or Asian). Ensure all topics, scenarios, and examples are culturally appropriate and relevant for users from Bangladesh or Asia. Please treat the user as someone who is actively improving their English to succeed in real-world communication. They may be a student speaking with teachers or classmates, an employee interacting with colleagues, supervisors, or clients, a job seeker preparing for interviews or workplace conversations, or someone handling everyday situations with native speakers—such as asking for help, making small talk, or dealing with customer service. Your role is to support them with clear, natural, and professional English while being patient, encouraging, and responsive to their learning needs

1. First, analyze the user's conversation history to estimate their English level, strengths, and weaknesses.
2. Use both the onboarding data and your analysis to create a personalized 1-week course (7 days) for this learner.

COURSE STRUCTURE:
- Days 1-5: Speaking practice (5 min) + Quiz
- Day 6: Quiz only
- Day 7: Weekly speaking exam

TOPIC REQUIREMENTS:
- Each topic must follow this EXACT structure:
{
  "id": "unique-id",
  "title": "Topic Title",
  "imageUrl": "https://placehold.co/400x600/1a202c/ffffff?text=Topic+Title",
  "prompt": "Detailed, scenario-based conversation prompt for the AI tutor. But naturally encourage the user to speak more, rather than letting you do most of the talking ",
  "firstPrompt": "Tell the user what today's topic is with greetings, and then ask a question relevant to the topic.",
  "isCustom": false,
  "category": "Personalized Topics"
}

here is the example of the topic structure:
{
  "id": "travel-experience-001",
  "title": "A Memorable Travel Experience",
  "imageUrl": "https://placehold.co/400x600/1a202c/ffffff?text=Travel+Experience",
  "prompt": "You're a friendly and curious English-speaking AI tutor. In this session, help the user practice speaking about a memorable travel experience. Ask follow-up questions about where they went, who they went with, what they saw or did, and how they felt. Correct their grammar gently and encourage descriptive, fluent storytelling.",
  "firstPrompt": "Start the conversation by saying exactly this and nothing else:  'Hi! our Today's topic is: A Memorable Travel Experience. Can you tell me about a trip you've taken that you'll never forget?'",
  "isCustom": false,
  "category": "Personalized Topics"
}


ACTIVITY FORMATS:
For each topic, select an engaging format such as:
- Debate (argue for/against a position)
- Role-play (act out a scenario)
- Interview (answer challenging questions)
- Storytelling (share a personal or imagined story)
- Problem-solving (find solutions to real-life challenges)
- Simulation (negotiate, persuade, or handle a situation)
- Advice column (give advice to someone facing a problem)
- Persuasion (convince the AI or a character to change their mind)
- Explaining a process (teach the AI how to do something)
- Describing a scene (imagine and describe a detailed event)
- Making a plan (plan an event, trip, or project)
- Comparing and contrasting (discuss pros/cons of two things)
- Improv scenario (respond to a surprising situation)
- Giving a speech (deliver a short speech on a topic)
- Describing feelings (share how you would feel/react)
- Making predictions (predict future trends or outcomes)
- Explaining a concept (explain a complex idea simply)
- Solving a mystery (work with the AI to solve a puzzle)
- Giving instructions (instruct the AI on a task)
- Cultural exchange (share and discuss cultural traditions)
- Reacting to news (respond to a news story)
- Brainstorming (generate creative ideas)
- Describing a dream (talk about your biggest dream)
- Handling conflict (resolve a disagreement)
- Giving feedback (provide constructive feedback)
- Making apologies (practice apologizing)
- Expressing gratitude (thank someone meaningfully)
- Making requests (ask for help or permission)
- Describing a favorite (talk about your favorite thing)
- Future self letter (speak as your future self)
...and more.
Do NOT simply ask the user to discuss a topic. Make the activity interactive, creative, and thought-provoking. Use at least 3 different formats across the 7 topics.

EXAMPLES:
- Debate: "Argue for or against the use of AI in your industry."
- Role-play: "Pretend you are at a job interview for your dream position. The AI will ask you questions."
- Problem-solving: "You have a communication problem with a colleague. How would you resolve it?"
- Storytelling: "Tell a story about a time you learned something new at work."
- Simulation: "Negotiate a contract with a client from another country."

GENERATION RULES:
1. Create 7 unique topics (one for each day), progressing from basic to advanced.
2. At least 2 topics must be directly relevant to the user's daily life or work.
3. At least 2 topics must be based on the user's interests or hobbies.
4. At least 1 topic must be fun, surprising, or unusual to spark curiosity.
5. At least 1 topic must target a weakness identified from the conversation data (grammar, vocabulary, or fluency).
6. Do NOT simply repeat the user's onboarding answers; combine and remix them to create engaging, real-world scenarios.
7. Each 'prompt' should immerse the user in a realistic situation.
8. Each 'firstPrompt' should be a creative, open-ended question or challenge.

PERSONALIZATION FACTORS:
- Current level: ${contextData.onboarding.currentLevel}
- Native language: ${contextData.onboarding.nativeLanguage}
- Industry: ${contextData.onboarding.industry}
- Interests: ${contextData.onboarding.interests?.join(', ')}

- Main goal: ${contextData.onboarding.mainGoal}

${strictJsonWarning}`
    },
    {
      role: 'user',
      content: `Generate a personalized 1-week course based on this user data: ${JSON.stringify(contextData)}`
    }
  ];

  const payload = {
    model: 'deepseek-r1-distill-llama-70b',
    messages: messages,
    temperature: 1,
    max_tokens: 40000
  };

  // Ensure we have the Groq API key
  let apiKey = process.env.GROQ_API_KEY;

  console.log('Using Groq API key for personalized course generation');

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.post(url, payload, { headers });
    if (response.data.choices && response.data.choices.length > 0) {
      const contentString = response.data.choices[0].message.content;
      try {
        // Try direct JSON parsing
        return JSON.parse(contentString);
      } catch (parseError) {
        // Try to extract JSON array from the text
        const jsonMatch = contentString.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (extractError) {
            console.error('Failed to extract JSON from response:', extractError);
            console.error('Raw Groq response:', contentString);
            if (retryCount < 2) {
              console.warn('Retrying Groq request for better JSON...');
              await new Promise(res => setTimeout(res, 2000)); // Wait 2 seconds before retry
              return await generatePersonalizedCourse(onboardingData, conversations, retryCount + 1);
            }
            throw new Error('Invalid JSON format in AI response after retries');
          }
        } else {
          console.error('No JSON array found in response:', contentString);
          if (retryCount < 2) {
            console.warn('Retrying Groq request for better JSON...');
            await new Promise(res => setTimeout(res, 2000));
            return await generatePersonalizedCourse(onboardingData, conversations, retryCount + 1);
          }
          throw new Error('No JSON array found in AI response after retries');
        }
      }
    } else {
      throw new Error('No response content from Groq API');
    }
  } catch (error) {
    console.error('Groq API error:', error.message);
    throw error;
  }
}

// Get full course timeline with all personalized topics
router.get('/courses/timeline', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Calculate current week and day
    const courseStart = new Date(course.course_start_date);
    const daysSinceStart = Math.floor((new Date() - courseStart) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    const currentDay = (daysSinceStart % 7) + 1;

    // Get all daily progress for this course
    const progressResult = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND course_id = $2 ORDER BY date',
      [userId, course.id]
    );

    const progressMap = {};
    console.log('Timeline API - Progress data from database:');
    progressResult.rows.forEach(progress => {
      // Ensure date is in YYYY-MM-DD format for consistent mapping
      const dateStr = progress.date instanceof Date 
        ? progress.date.toISOString().split('T')[0]
        : typeof progress.date === 'string' 
          ? progress.date.split('T')[0] 
          : progress.date;
      progressMap[dateStr] = progress;
      console.log(`  Original date: ${progress.date}, Mapped to: ${dateStr}`);
    });
    console.log('Timeline API - Progress map keys:', Object.keys(progressMap));

    // Build timeline with all 84 days
    const timeline = [];
    const personalizedTopics = course.personalized_topics || [];

    for (let week = 1; week <= 12; week++) {
      for (let day = 1; day <= 7; day++) {
        const dayIndex = (week - 1) * 7 + (day - 1);
        const date = new Date(courseStart);
        date.setDate(date.getDate() + dayIndex);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayType = getDayType(day);
        const personalizedTopic = dayIndex < personalizedTopics.length ? personalizedTopics[dayIndex] : null;
        const progress = progressMap[dateStr] || null;
        
        // Debug logging for current day
        if (week === currentWeek && day === currentDay) {
          console.log(`Timeline API - Current day (Week ${week}, Day ${day}):`);
          console.log(`  Generated dateStr: ${dateStr}`);
          console.log(`  Progress found: ${progress ? 'YES' : 'NO'}`);
          if (progress) {
            console.log(`  Progress data:`, {
              speaking_completed: progress.speaking_completed,
              quiz_completed: progress.quiz_completed,
              listening_completed: progress.listening_completed,
              listening_quiz_completed: progress.listening_quiz_completed,
              date: progress.date
            });
          }
        }
        
        // Updated isCompleted logic to match streak calculation
        let isCompleted = false;
        if (progress) {
          // Use the same logic as streak calculation
          if (day >= 1 && day <= 5) {
            // Days 1-5: All activities must be completed
            isCompleted = progress.speaking_completed && progress.quiz_completed && progress.listening_completed && progress.listening_quiz_completed;
          } else if (day === 6) {
            // Day 6: Only quiz needs to be completed
            isCompleted = progress.quiz_completed;
          } else if (day === 7) {
            // Day 7: Only speaking needs to be completed
            isCompleted = progress.speaking_completed;
          }
          
          // Debug logging for current day
          if (week === currentWeek && day === currentDay) {
            console.log(`Timeline API - isCompleted calculation for Day ${day}:`);
            console.log(`  speaking_completed: ${progress.speaking_completed}`);
            console.log(`  quiz_completed: ${progress.quiz_completed}`);
            console.log(`  listening_completed: ${progress.listening_completed}`);
            console.log(`  listening_quiz_completed: ${progress.listening_quiz_completed}`);
            console.log(`  Final isCompleted: ${isCompleted}`);
          }
        }

        const isCurrentDay = week === currentWeek && day === currentDay;
        const isPast = date < new Date();

        timeline.push({
          week: week,
          day: day,
          dayIndex: dayIndex,
          date: dateStr,
          dayType: dayType,
          personalizedTopic: personalizedTopic,
          progress: progress,
          isCompleted: isCompleted,
          isCurrentDay: isCurrentDay,
          isPast: isPast,
          isFuture: date > new Date()
        });
      }
    }

    res.json({
      success: true,
      data: {
        course: {
          id: course.id,
          startDate: course.course_start_date,
          endDate: course.course_end_date,
          currentWeek: currentWeek,
          currentDay: currentDay,
          totalWeeks: 12,
          totalDays: 84
        },
        timeline: timeline,
        personalizedTopicsCount: personalizedTopics.length
      }
    });

  } catch (error) {
    console.error('Error getting course timeline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get course timeline'
    });
  } finally {
    if (client) client.release();
  }
});

// Get today's personalized topic for practice
router.get('/courses/today-topic', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Calculate current week and day
    const courseStart = new Date(course.course_start_date);
    const daysSinceStart = Math.floor((new Date() - courseStart) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    const currentDay = (daysSinceStart % 7) + 1;

    // Get today's personalized topic
    let todayTopic = null;
    if (course.personalized_topics && course.personalized_topics.length > 0) {
      const dayIndex = (currentWeek - 1) * 7 + (currentDay - 1);
      if (dayIndex < course.personalized_topics.length) {
        todayTopic = course.personalized_topics[dayIndex];
      }
    }

    res.json({
      success: true,
      data: {
        topic: todayTopic,
        currentWeek: currentWeek,
        currentDay: currentDay
      }
    });

  } catch (error) {
    console.error('Error getting today\'s topic:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get today\'s topic'
    });
  } finally {
    if (client) client.release();
  }
});

// Enhanced progress analytics endpoint
router.get('/courses/analytics', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Get comprehensive analytics
    const analytics = await client.query(`
      SELECT 
        -- Overall progress
        COUNT(*) as total_days,
        COUNT(CASE WHEN speaking_completed = true THEN 1 END) as speaking_days,
        COUNT(CASE WHEN quiz_completed = true THEN 1 END) as quiz_days,
        COUNT(CASE WHEN listening_completed = true THEN 1 END) as listening_days,
        COUNT(CASE WHEN listening_quiz_completed = true THEN 1 END) as listening_quiz_days,
        -- Day-type-aware completion
        COUNT(
          CASE WHEN (
            (day_number BETWEEN 1 AND 5 AND speaking_completed AND quiz_completed AND listening_completed AND listening_quiz_completed)
            OR (day_number = 6 AND quiz_completed)
            OR (day_number = 7 AND speaking_completed)
          ) THEN 1 END
        ) as complete_days,
        AVG(quiz_score) as avg_quiz_score,
        AVG(listening_quiz_score) as avg_listening_quiz_score,
        
        -- Streak calculations (last dates by activity)
        MAX(CASE WHEN speaking_completed = true THEN date END) as last_speaking_date,
        MAX(CASE WHEN quiz_completed = true THEN date END) as last_quiz_date,
        MAX(CASE WHEN listening_completed = true THEN date END) as last_listening_date,
        MAX(CASE WHEN listening_quiz_completed = true THEN date END) as last_listening_quiz_date,
        
        -- Weekly averages
        AVG(CASE WHEN quiz_completed = true THEN quiz_score END) as weekly_avg_quiz,
        AVG(CASE WHEN listening_quiz_completed = true THEN listening_quiz_score END) as weekly_avg_listening_quiz,
        
        -- Time spent
        SUM(speaking_duration_seconds) as total_speaking_time,
        AVG(speaking_duration_seconds) as avg_speaking_time,
        SUM(listening_duration_seconds) as total_listening_time,
        AVG(listening_duration_seconds) as avg_listening_time
        
      FROM daily_progress 
      WHERE user_id = $1 AND course_id = $2
    `, [userId, course.id]);

    // Get weekly exam performance
    const weeklyExams = await client.query(`
      SELECT week_number, exam_score, exam_date, exam_duration_seconds
      FROM weekly_exams 
      WHERE user_id = $1 AND course_id = $2
      ORDER BY week_number
    `, [userId, course.id]);

    // Get speaking session details
    const speakingSessions = await client.query(`
      SELECT date, duration_seconds, start_time, end_time
      FROM speaking_sessions
      WHERE user_id = $1 AND course_id = $2
      ORDER BY date DESC
      LIMIT 30
    `, [userId, course.id]);

    // Calculate current streak
    const streakResult = await client.query(`
      WITH completed_days AS (
        SELECT date
        FROM daily_progress
        WHERE user_id = $1 AND course_id = $2
          AND (
            (day_number BETWEEN 1 AND 5 AND speaking_completed AND quiz_completed AND listening_completed AND listening_quiz_completed)
            OR (day_number = 6 AND quiz_completed)
            OR (day_number = 7 AND speaking_completed)
          )
      ), consecutive AS (
        SELECT date,
               ROW_NUMBER() OVER (ORDER BY date DESC) as rn,
               date - (ROW_NUMBER() OVER (ORDER BY date DESC) || ' days')::interval as grp
        FROM completed_days
      )
      SELECT COUNT(*) as current_streak
      FROM consecutive
      WHERE grp = (SELECT grp FROM consecutive WHERE date = CURRENT_DATE)
    `, [userId, course.id]);

    // Get monthly trends (last 6 months)
    const monthlyTrends = await client.query(`
      SELECT 
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        COUNT(CASE WHEN speaking_completed = true THEN 1 END) as speaking_days,
        COUNT(CASE WHEN quiz_completed = true THEN 1 END) as quiz_days,
        COUNT(CASE WHEN listening_completed = true THEN 1 END) as listening_days,
        COUNT(CASE WHEN listening_quiz_completed = true THEN 1 END) as listening_quiz_days,
        COUNT(
          CASE WHEN (
            (day_number BETWEEN 1 AND 5 AND speaking_completed AND quiz_completed AND listening_completed AND listening_quiz_completed)
            OR (day_number = 6 AND quiz_completed)
            OR (day_number = 7 AND speaking_completed)
          ) THEN 1 END
        ) as complete_days,
        AVG(quiz_score) as avg_quiz_score,
        AVG(listening_quiz_score) as avg_listening_quiz_score,
        SUM(speaking_duration_seconds) as total_speaking_time,
        SUM(listening_duration_seconds) as total_listening_time
      FROM daily_progress
      WHERE user_id = $1 AND course_id = $2 
        AND date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
      ORDER BY year DESC, month DESC
    `, [userId, course.id]);

    // Get skill improvement trends
    const skillTrends = await client.query(`
      SELECT 
        week_number,
        AVG(quiz_score) as avg_score,
        COUNT(CASE WHEN quiz_completed = true THEN 1 END) as quizzes_taken
      FROM daily_progress
      WHERE user_id = $1 AND course_id = $2 AND quiz_completed = true
      GROUP BY week_number
      ORDER BY week_number
    `, [userId, course.id]);

    const analyticsData = analytics.rows[0];
    const currentStreak = streakResult.rows[0]?.current_streak || 0;

    res.json({
      success: true,
      data: {
        course: {
          id: course.id,
          startDate: course.course_start_date,
          endDate: course.course_end_date,
          currentWeek: course.current_week,
          currentDay: course.current_day
        },
        progress: {
          total_days: parseInt(analyticsData.total_days) || 0,
          speaking_days: parseInt(analyticsData.speaking_days) || 0,
          quiz_days: parseInt(analyticsData.quiz_days) || 0,
          listening_days: parseInt(analyticsData.listening_days) || 0,
          listening_quiz_days: parseInt(analyticsData.listening_quiz_days) || 0,
          complete_days: parseInt(analyticsData.complete_days) || 0,
          avg_quiz_score: parseFloat(analyticsData.avg_quiz_score) || 0,
          avg_listening_quiz_score: parseFloat(analyticsData.avg_listening_quiz_score) || 0,
          current_streak: currentStreak,
          total_speaking_time: parseInt(analyticsData.total_speaking_time) || 0,
          avg_speaking_time: parseFloat(analyticsData.avg_speaking_time) || 0,
          total_listening_time: parseInt(analyticsData.total_listening_time) || 0,
          avg_listening_time: parseFloat(analyticsData.avg_listening_time) || 0,
          last_speaking_date: analyticsData.last_speaking_date,
          last_quiz_date: analyticsData.last_quiz_date,
          last_listening_date: analyticsData.last_listening_date,
          last_listening_quiz_date: analyticsData.last_listening_quiz_date
        },
        weeklyExams: weeklyExams.rows,
        speakingSessions: speakingSessions.rows,
        monthlyTrends: monthlyTrends.rows,
        skillTrends: skillTrends.rows
      }
    });

  } catch (error) {
    console.error('Error getting course analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get course analytics'
    });
  } finally {
    if (client) client.release();
  }
});

// Enhanced user achievements endpoint
router.get('/courses/achievements', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];

    // Calculate various achievements
    const achievements = await client.query(`
      SELECT 
        -- Streak achievements (same logic as analytics)
        (SELECT COUNT(*) FROM (
          WITH completed_days AS (
            SELECT date
            FROM daily_progress
            WHERE user_id = $1 AND course_id = $2
              AND (
                (day_number BETWEEN 1 AND 5 AND speaking_completed AND quiz_completed AND listening_completed AND listening_quiz_completed)
                OR (day_number = 6 AND quiz_completed)
                OR (day_number = 7 AND speaking_completed)
              )
          ), consecutive_days AS (
            SELECT date,
                   ROW_NUMBER() OVER (ORDER BY date DESC) as rn,
                   date - (ROW_NUMBER() OVER (ORDER BY date DESC) || ' days')::interval as grp
            FROM completed_days
          )
          SELECT COUNT(*) as streak_length
          FROM consecutive_days
          WHERE grp = (SELECT grp FROM consecutive_days WHERE date = CURRENT_DATE)
        ) t) as current_streak,
        
        -- Perfect scores
        COUNT(CASE WHEN quiz_score = 100 THEN 1 END) as perfect_scores,
        
        -- High scores (80+)
        COUNT(CASE WHEN quiz_score >= 80 THEN 1 END) as high_scores,
        
        -- Total sessions
        COUNT(CASE WHEN speaking_completed = true THEN 1 END) as total_sessions,
        
        -- Total quizzes
        COUNT(CASE WHEN quiz_completed = true THEN 1 END) as total_quizzes,
        
        -- Weekly exams passed
        (SELECT COUNT(*) FROM weekly_exams WHERE user_id = $1 AND course_id = $2 AND exam_score >= 60) as exams_passed,
        
        -- Total speaking time
        SUM(speaking_duration_seconds) as total_speaking_time
        
      FROM daily_progress 
      WHERE user_id = $1 AND course_id = $2
    `, [userId, course.id]);

    const achievementData = achievements.rows[0];
    const currentStreak = parseInt(achievementData.current_streak) || 0;
    const perfectScores = parseInt(achievementData.perfect_scores) || 0;
    const highScores = parseInt(achievementData.high_scores) || 0;
    const totalSessions = parseInt(achievementData.total_sessions) || 0;
    const totalQuizzes = parseInt(achievementData.total_quizzes) || 0;
    const examsPassed = parseInt(achievementData.exams_passed) || 0;
    const totalSpeakingTime = parseInt(achievementData.total_speaking_time) || 0;

    // Define achievement badges
    const badges = [
      {
        id: 'streak_7',
        name: '7-Day Streak',
        description: 'Complete 7 consecutive days of speaking practice',
        icon: '🔥',
        unlocked: currentStreak >= 7,
        progress: Math.min(100, (currentStreak / 7) * 100)
      },
      {
        id: 'streak_30',
        name: '30-Day Streak',
        description: 'Complete 30 consecutive days of speaking practice',
        icon: '🏆',
        unlocked: currentStreak >= 30,
        progress: Math.min(100, (currentStreak / 30) * 100)
      },
      {
        id: 'perfect_score',
        name: 'Perfect Score',
        description: 'Get a perfect score on any quiz',
        icon: '⭐',
        unlocked: perfectScores > 0,
        progress: perfectScores > 0 ? 100 : 0
      },
      {
        id: 'high_achiever',
        name: 'High Achiever',
        description: 'Get 5 scores of 80% or higher',
        icon: '🎯',
        unlocked: highScores >= 5,
        progress: Math.min(100, (highScores / 5) * 100)
      },
      {
        id: 'dedicated_learner',
        name: 'Dedicated Learner',
        description: 'Complete 20 speaking sessions',
        icon: '📚',
        unlocked: totalSessions >= 20,
        progress: Math.min(100, (totalSessions / 20) * 100)
      },
      {
        id: 'quiz_master',
        name: 'Quiz Master',
        description: 'Complete 10 quizzes',
        icon: '🧠',
        unlocked: totalQuizzes >= 10,
        progress: Math.min(100, (totalQuizzes / 10) * 100)
      },
      {
        id: 'exam_champion',
        name: 'Exam Champion',
        description: 'Pass 3 weekly exams',
        icon: '🏅',
        unlocked: examsPassed >= 3,
        progress: Math.min(100, (examsPassed / 3) * 100)
      },
      {
        id: 'time_master',
        name: 'Time Master',
        description: 'Spend 5 hours total speaking time',
        icon: '⏰',
        unlocked: totalSpeakingTime >= 18000, // 5 hours in seconds
        progress: Math.min(100, (totalSpeakingTime / 18000) * 100)
      }
    ];

    // Calculate user level and XP
    const totalXP = (totalSessions * 10) + (totalQuizzes * 15) + (examsPassed * 50) + (currentStreak * 5);
    const userLevel = Math.floor(totalXP / 100) + 1;
    const xpForNextLevel = userLevel * 100;
    const xpProgress = (totalXP % 100) / 100 * 100;

    res.json({
      success: true,
      data: {
        badges,
        level: {
          current: userLevel,
          xp: totalXP,
          xpForNextLevel,
          xpProgress: Math.round(xpProgress)
        },
        stats: {
          currentStreak,
          perfectScores,
          highScores,
          totalSessions,
          totalQuizzes,
          examsPassed,
          totalSpeakingTime
        }
      }
    });

  } catch (error) {
    console.error('Error getting achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get achievements'
    });
  } finally {
    if (client) client.release();
  }
});

// Enhanced weekly progress endpoint
router.get('/courses/weekly-progress', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    const userId = req.user.id;
    const { week } = req.query;

    // Get user's active course
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const course = courseResult.rows[0];
    const targetWeek = week ? parseInt(week) : course.current_week;

    // Get weekly progress data
    const weeklyProgress = await client.query(`
      SELECT 
        day_number,
        date,
        speaking_completed,
        quiz_completed,
        quiz_score,
        speaking_duration_seconds,
        quiz_attempts
      FROM daily_progress
      WHERE user_id = $1 AND course_id = $2 AND week_number = $3
      ORDER BY day_number
    `, [userId, course.id, targetWeek]);

    // Get weekly exam if exists
    const weeklyExam = await client.query(`
      SELECT exam_score, exam_date, exam_duration_seconds
      FROM weekly_exams
      WHERE user_id = $1 AND course_id = $2 AND week_number = $3
    `, [userId, course.id, targetWeek]);

    // Calculate weekly statistics
    const weeklyStats = await client.query(`
      SELECT 
        COUNT(*) as total_days,
        COUNT(CASE WHEN speaking_completed = true THEN 1 END) as speaking_days,
        COUNT(CASE WHEN quiz_completed = true THEN 1 END) as quiz_days,
        AVG(quiz_score) as avg_quiz_score,
        SUM(speaking_duration_seconds) as total_speaking_time,
        MAX(quiz_score) as best_quiz_score
      FROM daily_progress
      WHERE user_id = $1 AND course_id = $2 AND week_number = $3
    `, [userId, course.id, targetWeek]);

    const stats = weeklyStats.rows[0];

    res.json({
      success: true,
      data: {
        week: targetWeek,
        progress: weeklyProgress.rows,
        exam: weeklyExam.rows[0] || null,
        stats: {
          total_days: parseInt(stats.total_days) || 0,
          speaking_days: parseInt(stats.speaking_days) || 0,
          quiz_days: parseInt(stats.quiz_days) || 0,
          avg_quiz_score: parseFloat(stats.avg_quiz_score) || 0,
          total_speaking_time: parseInt(stats.total_speaking_time) || 0,
          best_quiz_score: parseInt(stats.best_quiz_score) || 0
        }
      }
    });

  } catch (error) {
    console.error('Error getting weekly progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get weekly progress'
    });
  } finally {
    if (client) client.release();
  }
});

// Helper functions
function getDayType(dayNumber) {
  // Days 1-5: Speaking Zone + Quiz + Listening Zone + Listening Quiz
  if (dayNumber >= 1 && dayNumber <= 5) {
    return 'all_activities';
  } else if (dayNumber === 6) {
    return 'quiz_only';
  } else if (dayNumber === 7) {
    return 'speaking_exam';
  }
  return 'all_activities'; // Default fallback
}

function calculateTimeRemaining(progress) {
  // This function is deprecated - use actual speaking session start time instead
  // Keeping for backward compatibility but it should not be used for active sessions
  if (!progress || !progress.speaking_start_time) {
    return 5 * 60; // 5 minutes in seconds
  }

  const startTime = new Date(progress.speaking_start_time);
  const now = new Date();
  const elapsed = Math.floor((now - startTime) / 1000);
  const remaining = (5 * 60) - elapsed;
  
  return Math.max(0, remaining);
}

function isSpeakingAvailable(dayType, progress) {
  // Speaking is not available on quiz-only days
  if (dayType === 'quiz_only') {
    return false;
  }
  
  // If no progress exists, speaking is available
  if (!progress) {
    return true;
  }
  
  // If speaking is already completed, it's not available
  if (progress.speaking_completed) {
    return false;
  }
  
  // Note: For active sessions, the actual time remaining should be calculated
  // using the speaking_sessions table, not this progress-based calculation
  // This function is used for availability checking, not active session timing
  return true; // If not completed and day type allows, speaking is available
}

function isQuizAvailable(dayType, progress) {
  // Quiz is not available on speaking exam days
  if (dayType === 'speaking_exam') {
    return false;
  }
  
  // If no progress exists
  if (!progress) {
    // On quiz-only days, quiz is immediately available
    if (dayType === 'quiz_only') {
      return true;
    }
    // On all_activities days, quiz is only available after speaking is completed
    if (dayType === 'all_activities') {
      return false; // Need to complete speaking first
    }
    return false;
  }
  
  // If quiz is already completed, it's not available
  if (progress.quiz_completed) {
    return false;
  }
  
  // For quiz-only days, quiz is available
  if (dayType === 'quiz_only') {
    return true;
  }
  
  // For all_activities days, quiz is only available after speaking is completed
  if (dayType === 'all_activities') {
    return progress.speaking_completed;
  }
  
  return false;
}

function isListeningAvailable(dayType, progress) {
  // Listening is only available on all_activities days
  if (dayType !== 'all_activities') {
    return false;
  }
  
  // If no progress exists
  if (!progress) {
    // On all_activities days, listening is only available after quiz is completed
    return false; // Need to complete quiz first
  }
  
  // If listening is already completed, it's not available
  if (progress.listening_completed) {
    return false;
  }
  
  // For all_activities days, listening is only available after quiz is completed
  return progress.quiz_completed;
}

function isListeningQuizAvailable(dayType, progress) {
  // Listening quiz is only available on all_activities days
  if (dayType !== 'all_activities') {
    return false;
  }
  
  // If no progress exists
  if (!progress) {
    // On all_activities days, listening quiz is only available after listening is completed
    return false; // Need to complete listening first
  }
  
  // If listening quiz is already completed, it's not available
  if (progress.listening_quiz_completed) {
    return false;
  }
  
  // For all_activities days, listening quiz is only available after listening is completed
  return progress.listening_completed;
}

// Generate next batch of personalized topics (append to current course, do not create a new course)
router.post('/courses/generate-next-batch', authenticateToken, async (req, res) => {
  let client;
  try {
    console.log('Generate next batch request for user:', req.user);
    client = await db.pool.connect();
    
    const userId = req.user.id;
    console.log('User ID:', userId);

    // Get user's current active course
    const currentCourseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (currentCourseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active course found'
      });
    }

    const currentCourse = currentCourseResult.rows[0];
    const nextBatchNumber = (currentCourse.batch_number || 1) + 1;

    // Get user's onboarding data directly by user ID
    const onboardingResult = await client.query(
      'SELECT * FROM onboarding_data WHERE user_id = $1',
      [userId]
    );
    
    // Only proceed if onboarding data exists
    if (onboardingResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Onboarding data not found. Please complete onboarding first.'
      });
    }

    // Get user's conversation history
    const conversationResult = await client.query(
      'SELECT transcript FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5',
      [userId]
    );
    
    const conversations = conversationResult.rows.map(row => row.transcript);

    // Generate personalized topics for the next batch
    const onboardingData = onboardingResult.rows[0];
    let personalizedTopics;
    
    try {
      personalizedTopics = await generatePersonalizedCourse(onboardingData, conversations);
      console.log('Next batch personalized course generated with', personalizedTopics.length, 'topics');
    } catch (error) {
      console.error('Error generating next batch personalized course:', error);
      return res.status(400).json({
        success: false,
        error: 'Failed to generate next batch personalized course. Please try again.'
      });
    }

    // Only create course if personalized topics are generated
    if (!personalizedTopics || personalizedTopics.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Personalized topics could not be generated for next batch. Please try again.'
      });
    }

    // Append new topics to the existing active course without resetting progress or dates
    const updatedTopics = Array.isArray(currentCourse.personalized_topics)
      ? currentCourse.personalized_topics.concat(personalizedTopics)
      : personalizedTopics;

    const updateResult = await client.query(
      `UPDATE user_courses 
       SET personalized_topics = $1::jsonb, 
           batch_number = $2, 
           batch_status = NULL
       WHERE id = $3
       RETURNING *`,
      [
        JSON.stringify(updatedTopics),
        nextBatchNumber,
        currentCourse.id
      ]
    );

    console.log('Next batch topics appended successfully for course:', currentCourse.id);
    res.status(201).json({
      success: true,
      data: {
        ...updateResult.rows[0],
        personalizedTopicsCount: updatedTopics.length,
        batchNumber: nextBatchNumber
      },
      message: `Batch ${nextBatchNumber} appended successfully`
    });

  } catch (error) {
    console.error('Error generating next batch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate next batch'
    });
  } finally {
    if (client) client.release();
  }
});

// Activate next batch of personalized topics (no-op in single-course mode; clears batch status)
// Note: '/courses/activate-next-batch' endpoint removed in single-course mode

// Helper function to check and trigger next batch generation when the last day of the current batch is completed
async function checkAndTriggerNextBatch(client, userId, currentDay, currentWeek) {
  try {
    console.log(`Checking for batch completion for user ${userId}, week ${currentWeek}, day ${currentDay}`);
    
    // Get user's current active course
    const currentCourseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (currentCourseResult.rows.length === 0) {
      console.log('No active course found for user');
      return;
    }

    const currentCourse = currentCourseResult.rows[0];
    
    // Check if this is the first time we're triggering for this week
    if (currentCourse.batch_status && currentCourse.batch_status.action === 'generate_next_batch') {
      console.log('Batch generation already triggered for this week');
      return;
    }

    // Determine if this is the last day of the current batch
    // For now, each batch is 7 days (1 week), but this can be made configurable
    const BATCH_DURATION_DAYS = 7; // This could be made configurable per course or user
    const isLastDayOfBatch = currentDay === BATCH_DURATION_DAYS;
    
    if (!isLastDayOfBatch) {
      console.log(`Not the last day of batch. Current day: ${currentDay}, Batch duration: ${BATCH_DURATION_DAYS}`);
      return;
    }

    // Check if this is the final week (12 weeks = 3 months)
    const TOTAL_COURSE_WEEKS = 12;
    const isFinalWeek = currentWeek >= TOTAL_COURSE_WEEKS;
    
    if (isFinalWeek) {
      console.log(`Course completed! User ${userId} has finished all ${TOTAL_COURSE_WEEKS} weeks`);
      
      // Set course as completed instead of generating next batch
      await client.query(
        `UPDATE user_courses 
         SET batch_status = $1 
         WHERE id = $2`,
        [
          JSON.stringify({
            action: 'course_completed',
            message: `Congratulations! You have completed the full 3-month course!`,
            completedWeek: currentWeek,
            completedDay: currentDay,
            totalWeeks: TOTAL_COURSE_WEEKS
          }),
          currentCourse.id
        ]
      );
      
      console.log(`Course marked as completed for user ${userId}, week ${currentWeek}, day ${currentDay}`);
      return;
    }

    const nextBatchNumber = (currentCourse.batch_number || 1) + 1;
    
    // Set batch status to trigger next batch generation
    await client.query(
      `UPDATE user_courses 
       SET batch_status = $1 
       WHERE id = $2`,
      [
        JSON.stringify({
          action: 'generate_next_batch',
          message: `Batch ${currentCourse.batch_number || 1} completed! Ready to generate batch ${nextBatchNumber}`,
          batch_number: nextBatchNumber,
          completedWeek: currentWeek,
          completedDay: currentDay
        }),
        currentCourse.id
      ]
    );

    console.log(`Batch generation triggered for user ${userId}, week ${currentWeek}, day ${currentDay}, batch ${nextBatchNumber}`);
  } catch (error) {
    console.error('Error in checkAndTriggerNextBatch:', error);
  }
}

module.exports = router; 