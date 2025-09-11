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
    const weekNumber = parseInt(week);
    const dayNumber = parseInt(day);

    // Validate input
    if (isNaN(weekNumber) || isNaN(dayNumber) || weekNumber < 1 || dayNumber < 1 || dayNumber > 7) {
      return res.status(400).json({
        success: false,
        error: 'Invalid week or day number. Week must be >= 1, day must be 1-7.'
      });
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

    res.json({
      success: true,
      data: {
        week: weekNumber,
        day: dayNumber,
        words: wordsResult.rows,
        totalWords: wordsResult.rows.length
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

module.exports = router;