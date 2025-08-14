// routes/onboarding-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { authenticateToken } = require('./auth-routes');

// POST /api/onboarding - Save or update onboarding data
router.post('/onboarding', authenticateToken, async (req, res) => {
  let client;
  try {
    const {
      user_id,
      skill_to_improve, language_statement, industry,
      speaking_feelings, speaking_frequency, main_goal,
      gender, current_learning_methods, current_level,
      native_language, known_words_1, known_words_2,
      interests, english_style, tutor_style
    } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    client = await pool.connect();

    // Check if onboarding data already exists for this user
    const existingResult = await client.query(
      'SELECT id FROM onboarding_data WHERE user_id = $1',
      [user_id]
    );

    if (existingResult.rows.length > 0) {
      // Update existing onboarding data
      const updateResult = await client.query(`
        UPDATE onboarding_data SET
          skill_to_improve = $2,
          language_statement = $3,
          industry = $4,
          speaking_feelings = $5,
          speaking_frequency = $6,
          main_goal = $7,
          gender = $8,
          current_learning_methods = $9,
          current_level = $10,
          native_language = $11,
          known_words_1 = $12,
          known_words_2 = $13,
          interests = $14,
          english_style = $15,
          tutor_style = $16,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [
        user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, current_learning_methods,
        current_level, native_language, known_words_1,
        known_words_2, interests, english_style, tutor_style
      ]);

      res.json({
        success: true,
        message: 'Onboarding data updated successfully',
        data: updateResult.rows[0]
      });
    } else {
      // Insert new onboarding data
      const insertResult = await client.query(`
        INSERT INTO onboarding_data (
          user_id, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, current_learning_methods,
          current_level, native_language, known_words_1,
          known_words_2, interests, english_style, tutor_style
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `, [
        user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, current_learning_methods,
        current_level, native_language, known_words_1,
        known_words_2, interests, english_style, tutor_style
      ]);

      res.status(201).json({
        success: true,
        message: 'Onboarding data saved successfully',
        data: insertResult.rows[0]
      });
    }

  } catch (error) {
    console.error('Error saving onboarding data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save onboarding data'
    });
  } finally {
    if (client) client.release();
  }
});

// GET /api/onboarding/user/:user_id - Get onboarding data by user ID
router.get('/onboarding/user/:user_id', authenticateToken, async (req, res) => {
  let client;
  try {
    const { user_id } = req.params;
    console.log('Fetching onboarding data for user_id:', user_id);
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    client = await pool.connect();

    const result = await client.query(
      'SELECT * FROM onboarding_data WHERE user_id = $1',
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Onboarding data not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching onboarding data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch onboarding data'
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;

