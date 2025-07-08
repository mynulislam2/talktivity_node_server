const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const axios = require('axios');

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
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 84); // 12 weeks * 7 days = 84 days

    // Check if user already has an active course
    const existingCourse = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (existingCourse.rows.length > 0) {
      console.log('User already has an active course');
      return res.status(400).json({
        success: false,
        error: 'User already has an active course'
      });
    }

    // Check if user has onboarding data and conversations for personalized course
    // For now, we'll check for any onboarding data and conversations
    // TODO: Add fingerprint_id to users table for proper linking
    const onboardingResult = await client.query(
      'SELECT * FROM onboarding_data LIMIT 1',
      []
    );
    
    const conversationResult = await client.query(
      'SELECT transcript FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5',
      [userId]
    );

    let personalizedTopics = [];
    
    // Generate personalized course if user has onboarding data
    if (onboardingResult.rows.length > 0 && conversationResult.rows.length > 0) {
      try {
        const onboardingData = onboardingResult.rows[0];
        const conversations = conversationResult.rows.map(row => row.transcript);
        
 
        
        personalizedTopics = await generatePersonalizedCourse(onboardingData, conversations);
        console.log('Personalized course generated with', personalizedTopics.length, 'topics');
      } catch (error) {
        console.error('Error generating personalized course:', error);
        // Continue with empty personalized topics if generation fails
        personalizedTopics = [];
      }
    } else {
      console.log('No onboarding data or conversations found for personalized course generation');
      if (onboardingResult.rows.length === 0) {
        console.log('- Missing onboarding data');
      }
      if (conversationResult.rows.length === 0) {
        console.log('- Missing conversation history');
      }
    }

    // Create new course with personalized topics
    const result = await client.query(
      `INSERT INTO user_courses (user_id, course_start_date, course_end_date, current_week, current_day, personalized_topics)
       VALUES ($1, $2, $3, 1, 1, $4)
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

    // Sum all speaking session durations for today
    const sumResult = await client.query(
      'SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM speaking_sessions WHERE user_id = $1 AND date = $2',
      [userId, today]
    );
    const totalSeconds = parseInt(sumResult.rows[0].total_seconds, 10);
    const maxSeconds = 5 * 60;
    const timeRemaining = Math.max(0, maxSeconds - totalSeconds);
    // speakingAvailable: true if timeRemaining > 0 and not marked completed
    const speakingAvailable = timeRemaining > 0 && !(todayProgress && todayProgress.speaking_completed);

    // Determine what's available today
    const dayType = getDayType(currentDay);

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
        course: {
          id: course.id,
          currentWeek: currentWeek,
          currentDay: currentDay,
          dayType: dayType,
          totalWeeks: 12,
          totalDays: 84,
          todayTopic: todayTopic
        },
        today: {
          date: today,
          progress: todayProgress,
          timeRemaining: timeRemaining,
          speakingAvailable: speakingAvailable,
          quizAvailable: isQuizAvailable(dayType, todayProgress)
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
    await client.query(
      `INSERT INTO speaking_sessions (user_id, course_id, date, start_time) VALUES ($1, $2, $3, NOW())`,
      [userId, course.id, today]
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
      `UPDATE speaking_sessions SET end_time = NOW(), duration_seconds = $1, updated_at = NOW() WHERE id = $2`,
      [durationSeconds, session.id]
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
      const course = courseResult.rows[0];
      // Upsert daily_progress
      await client.query(
        `INSERT INTO daily_progress (user_id, course_id, week_number, day_number, date, speaking_completed)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (user_id, date) DO UPDATE SET speaking_completed = true, speaking_end_time = NOW()`,
        [userId, course.id, course.current_week, course.current_day, today]
      );
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
    
    if (!progress.speaking_start_time || progress.speaking_completed) {
      return res.json({
        success: true,
        data: {
          timeRemaining: 0,
          shouldAutoComplete: false
        }
      });
    }

    // Calculate time remaining
    const startTime = new Date(progress.speaking_start_time);
    const now = new Date();
    const elapsed = Math.floor((now - startTime) / 1000);
    const timeRemaining = Math.max(0, (5 * 60) - elapsed);
    const shouldAutoComplete = timeRemaining <= 0;

    // Auto-complete if time is up
    if (shouldAutoComplete && !progress.speaking_completed) {
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

// Complete quiz
router.post('/courses/quiz/complete', authenticateToken, async (req, res) => {
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

    // Update quiz completion
    await client.query(
      `UPDATE daily_progress 
       SET quiz_completed = true, quiz_score = $1, quiz_attempts = quiz_attempts + 1
       WHERE user_id = $2 AND date = $3`,
      [score, userId, today]
    );

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
         AVG(quiz_score) as avg_quiz_score
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
          pronunciation: 75,
          vocabulary: 80,
          grammar: 72,
          feedback: 'No conversation data available for this month. Keep practicing to get personalized feedback!'
        };
      } else {
                const formattedMessages = [
          {
            role: 'system',
            content: `Analyze the following English conversation data and return a JSON object with these properties:\n- fluency: 0-100\n- pronunciation: 0-100\n- vocabulary: 0-100\n- grammar: 0-100\n- feedback: 1-2 sentences of constructive feedback\n\nBase your analysis ONLY on the provided conversation turns. IMPORTANT: Return ONLY a valid JSON object. Do not include any explanatory text or markdown formatting. The response should start with '{' and end with '}'.`
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
        pronunciation: Math.floor(Math.random() * 100),
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
        quizzes,
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
    
    // Get user's onboarding data
    // For now, we'll check for any onboarding data
    // TODO: Add fingerprint_id to users table for proper linking
    const onboardingResult = await client.query(
      'SELECT * FROM onboarding_data LIMIT 1',
      []
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
async function generatePersonalizedCourse(onboardingData, conversations) {
  const axios = require('axios');
  
  // Format the data for Groq AI
  const contextData = {
    onboarding: {
      skillToImprove: onboardingData.skill_to_improve,
      currentLevel: onboardingData.current_level,
      nativeLanguage: onboardingData.native_language,
      industry: onboardingData.industry,
      interests: onboardingData.interests,
      workScenarios: onboardingData.work_scenarios,
      upcomingOccasions: onboardingData.upcoming_occasions,
      improvementAreas: onboardingData.improvement_areas,
      mainGoal: onboardingData.main_goal,
      englishUsage: onboardingData.english_usage,
      speakingFeelings: onboardingData.speaking_feelings,
      speakingFrequency: onboardingData.speaking_frequency,
      speakingObstacles: onboardingData.speaking_obstacles,
      currentLearningMethods: onboardingData.current_learning_methods,
      learningChallenges: onboardingData.learning_challenges,
      hardestPart: onboardingData.hardest_part,
      knownWords1: onboardingData.known_words_1,
      knownWords2: onboardingData.known_words_2,
      englishStyle: onboardingData.english_style,
      tutorStyle: onboardingData.tutor_style
    },
    conversations: conversations
  };

  const messages = [
    {
      role: 'system',
      content: `You are an expert English language curriculum designer. Create a personalized 3-month course (90 days) for an English learner based on their onboarding data and conversation history.

COURSE STRUCTURE:
- Days 1-5 of each week: Speaking practice (5 min) + Quiz
- Day 6 of each week: Quiz only
- Day 7 of each week: Weekly speaking exam

TOPIC REQUIREMENTS:
- Each topic must follow this EXACT structure to match the existing topics system:
{
  "id": "unique-id",
  "title": "Topic Title",
  "imageUrl": "https://placehold.co/400x600/1a202c/ffffff?text=Topic+Title",
  "prompt": "Detailed conversation prompt for the AI tutor",
  "firstPrompt": "Initial question to start the conversation",
  "isCustom": false,
  "category": "Personalized Topics"
}

GENERATION RULES:
1. Create 90 unique topics (one for each day)
2. Topics should progress from basic to advanced
3. Focus on user's specific needs from onboarding data
4. Incorporate their interests, work scenarios, and upcoming occasions
5. Address their improvement areas and learning challenges
6. Use conversation history to identify weak areas
7. Ensure topics are relevant to their industry and goals
8. Make topics engaging and practical for their daily life

PERSONALIZATION FACTORS:
- Current level: ${contextData.onboarding.currentLevel}
- Native language: ${contextData.onboarding.nativeLanguage}
- Industry: ${contextData.onboarding.industry}
- Interests: ${contextData.onboarding.interests?.join(', ')}
- Work scenarios: ${contextData.onboarding.workScenarios?.join(', ')}
- Upcoming occasions: ${contextData.onboarding.upcomingOccasions?.join(', ')}
- Improvement areas: ${contextData.onboarding.improvementAreas?.join(', ')}
- Main goal: ${contextData.onboarding.mainGoal}

IMPORTANT: You must return ONLY a valid JSON array containing exactly 90 topic objects. Do not include any explanatory text, markdown formatting, or additional content outside the JSON array. The response should start with '[' and end with ']'.`
    },
    {
      role: 'user',
      content: `Generate a personalized 3-month course based on this user data: ${JSON.stringify(contextData)}`
    }
  ];

  const payload = {
    model: 'llama3-8b-8192',
    messages: messages,
    temperature: 0.7,
    max_tokens: 4000
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
      
      // Try to extract JSON from the response
      try {
        // First try direct JSON parsing
        return JSON.parse(contentString);
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from the text
        const jsonMatch = contentString.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (extractError) {
            console.error('Failed to extract JSON from response:', extractError);
            console.error('Response content:', contentString);
            throw new Error('Invalid JSON format in AI response');
          }
        } else {
          console.error('No JSON array found in response:', contentString);
          throw new Error('No JSON array found in AI response');
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

// Helper functions
function getDayType(dayNumber) {
  if (dayNumber >= 1 && dayNumber <= 5) {
    return 'speaking_quiz';
  } else if (dayNumber === 6) {
    return 'quiz_only';
  } else if (dayNumber === 7) {
    return 'speaking_exam';
  }
  return 'unknown';
}

function calculateTimeRemaining(progress) {
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
  
  // Check if 5 minutes have elapsed
  const timeRemaining = calculateTimeRemaining(progress);
  return timeRemaining > 0;
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
    // On speaking_quiz days, quiz is only available after speaking is completed
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
  
  // For speaking_quiz days, quiz is only available after speaking is completed
  return progress.speaking_completed;
}

module.exports = router; 