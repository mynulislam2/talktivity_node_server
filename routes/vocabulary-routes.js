// routes/vocabulary-routes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./auth-routes');
const db = require('../db');

// GET /api/vocabulary/words/:week/:day - Get words for specific week and day
router.get('/words/:week/:day', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const { week, day } = req.params;
    const userId = req.user.userId; // Get user ID from authenticated token (fixed)
    const weekNumber = parseInt(week);
    const dayNumber = parseInt(day);

    console.log(`Fetching vocabulary words for user ${userId}, week ${weekNumber}, day ${dayNumber}`);

    // Validate input
    if (isNaN(weekNumber) || isNaN(dayNumber) || weekNumber < 1 || dayNumber < 1 || dayNumber > 7) {
      return res.status(400).json({
        success: false,
        error: 'Invalid week or day number. Week must be >= 1, day must be 1-7.'
      });
    }

    // Check if user has already completed vocabulary for this day
    // Use a more explicit date comparison to avoid timezone issues
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    console.log(`Checking completion for today: ${today}`);
    
    const completionResult = await client.query(
      `SELECT id, user_id, week_number, day_number, completed_date FROM vocabulary_completions 
       WHERE user_id = $1 AND week_number = $2 AND day_number = $3 
       AND completed_date = $4`,
      [userId, weekNumber, dayNumber, today]
    );

    const isCompleted = completionResult.rows.length > 0;
    
    console.log(`Vocabulary completion check for user ${userId}: ${isCompleted ? 'COMPLETED' : 'NOT COMPLETED'}`);
    if (isCompleted) {
      console.log('Completion record:', completionResult.rows[0]);
    }

    // Get words for the specified week and day
    const wordsResult = await client.query(
      `SELECT 
         w.id,
         w.word,
         w.meaning_bn,
         w.example_en,
         w.example_bn,
         w.word_order,
         w.created_at
       FROM vocabulary_words w
       WHERE w.week_number = $1 AND w.day_number = $2
       ORDER BY w.word_order ASC, w.word ASC`,
      [weekNumber, dayNumber]
    );

    // Check if day exists
    const dayExists = await client.query(
      `SELECT id FROM vocabulary_days WHERE week_number = $1 AND day_number = $2`,
      [weekNumber, dayNumber]
    );

    if (dayExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No vocabulary data found for week ${weekNumber}, day ${dayNumber}`
      });
    }

    console.log(`Returning ${wordsResult.rows.length} words, isCompleted: ${isCompleted}`);
    
    res.json({
      success: true,
      data: {
        week: weekNumber,
        day: dayNumber,
        words: wordsResult.rows,
        totalWords: wordsResult.rows.length,
        isCompleted: isCompleted // Add completion status to response
      }
    });

  } catch (error) {
    console.error('Error fetching vocabulary words:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vocabulary words'
    });
  } finally {
    if (client) client.release();
  }
});

// POST /api/vocabulary/complete/:week/:day - Mark vocabulary as completed for the day
router.post('/complete/:week/:day', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const { week, day } = req.params;
    const userId = req.user.userId; // Get user ID from authenticated token (fixed)
    const weekNumber = parseInt(week);
    const dayNumber = parseInt(day);

    console.log(`Marking vocabulary as completed for user ${userId}, week ${weekNumber}, day ${dayNumber}`);

    // Validate input
    if (isNaN(weekNumber) || isNaN(dayNumber) || weekNumber < 1 || dayNumber < 1 || dayNumber > 7) {
      return res.status(400).json({
        success: false,
        error: 'Invalid week or day number. Week must be >= 1, day must be 1-7.'
      });
    }

    // Insert or update completion record
    // Use explicit date to avoid timezone issues
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    console.log(`Storing completion for today: ${today}`);
    
    const result = await client.query(
      `INSERT INTO vocabulary_completions (user_id, week_number, day_number, completed_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, week_number, day_number, completed_date) 
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, week_number, day_number, completed_date, created_at, updated_at`,
      [userId, weekNumber, dayNumber, today]
    );

    console.log('Vocabulary completion record created/updated:', result.rows[0]);

    res.json({
      success: true,
      message: 'Vocabulary marked as completed for today',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error marking vocabulary as completed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark vocabulary as completed'
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;