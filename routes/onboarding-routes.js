// routes/onboarding-routes.js
const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// POST /api/onboarding - Store/Update onboarding data
router.post('/onboarding', async (req, res) => {
  let client;
  try {
    const {
      fingerprint_id,
      skill_to_improve,
      language_statement,
      industry,
      speaking_feelings,
      speaking_frequency,
      main_goal,
      gender,
      current_learning_methods,
      current_level,
      native_language,
      known_words_1,
      known_words_2,
      interests,
      english_style,
      tutor_style
    } = req.body;
console.log('Received onboarding data:', req.body);
    if (!fingerprint_id) {
      return res.status(400).json({
        success: false,
        error: 'fingerprint_id is required'
      });
    }

    client = await pool.connect();
    
    // Check if record exists
    const existingRecord = await client.query(
      'SELECT id FROM onboarding_data WHERE fingerprint_id = $1',
      [fingerprint_id]
    );

    let result;
    if (existingRecord.rows.length > 0) {
      // Update existing record
      result = await client.query(`
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
          updated_at = CURRENT_TIMESTAMP
        WHERE fingerprint_id = $1
        RETURNING *
      `, [
        fingerprint_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, JSON.stringify(current_learning_methods),
        current_level, native_language, JSON.stringify(known_words_1),
        JSON.stringify(known_words_2), JSON.stringify(interests),
        english_style, JSON.stringify(tutor_style)
      ]);
    } else {
      // Insert new record
      result = await client.query(`
        INSERT INTO onboarding_data (
          fingerprint_id, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, current_learning_methods,
          current_level, native_language, known_words_1, known_words_2,
          interests, english_style, tutor_style
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) RETURNING *
      `, [
        fingerprint_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, JSON.stringify(current_learning_methods),
        current_level, native_language, JSON.stringify(known_words_1),
        JSON.stringify(known_words_2), JSON.stringify(interests),
        english_style, JSON.stringify(tutor_style)
      ]);
    }


    res.status(200).json({
      success: true,
      data:result.rows[0]
    });

  } catch (error) {
    console.error('Error saving onboarding data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  } finally {
    if (client) client.release();
  }
});

// GET /api/onboarding/:fingerprint_id - Get onboarding data by fingerprint ID
router.get('/onboarding/:fingerprint_id', async (req, res) => {
  let client;
  try {
    const { fingerprint_id } = req.params;
console.log('Fetching onboarding data for fingerprint_id:', fingerprint_id);
    if (!fingerprint_id) {
      return res.status(400).json({
        success: false,
        error: 'fingerprint_id is required'
      });
    }

    client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM onboarding_data WHERE fingerprint_id = $1',
      [fingerprint_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Data not found'
      });
    }


    res.status(200).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error retrieving onboarding data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;

