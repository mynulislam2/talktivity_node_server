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
      english_usage,
      industry,
      speaking_feelings,
      speaking_frequency,
      improvement_areas,
      main_goal,
      speaking_obstacles,
      gender,
      current_learning_methods,
      learning_challenges,
      hardest_part,
      current_level,
      native_language,
      known_words_1,
      known_words_2,
      work_scenarios,
      upcoming_occasions,
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
          english_usage = $4,
          industry = $5,
          speaking_feelings = $6,
          speaking_frequency = $7,
          improvement_areas = $8,
          main_goal = $9,
          speaking_obstacles = $10,
          gender = $11,
          current_learning_methods = $12,
          learning_challenges = $13,
          hardest_part = $14,
          current_level = $15,
          native_language = $16,
          known_words_1 = $17,
          known_words_2 = $18,
          work_scenarios = $19,
          upcoming_occasions = $20,
          interests = $21,
          english_style = $22,
          tutor_style = $23,
          updated_at = CURRENT_TIMESTAMP
        WHERE fingerprint_id = $1
        RETURNING *
      `, [
        fingerprint_id, skill_to_improve, language_statement,
        JSON.stringify(english_usage), industry, speaking_feelings, speaking_frequency,
        JSON.stringify(improvement_areas), main_goal, JSON.stringify(speaking_obstacles),
        gender, JSON.stringify(current_learning_methods), JSON.stringify(learning_challenges),
        hardest_part, current_level, native_language, JSON.stringify(known_words_1),
        JSON.stringify(known_words_2), JSON.stringify(work_scenarios),
        JSON.stringify(upcoming_occasions), JSON.stringify(interests),
        english_style, JSON.stringify(tutor_style)
      ]);
    } else {
      // Insert new record
      result = await client.query(`
        INSERT INTO onboarding_data (
          fingerprint_id, skill_to_improve, language_statement,
          english_usage, industry, speaking_feelings, speaking_frequency,
          improvement_areas, main_goal, speaking_obstacles, gender,
          current_learning_methods, learning_challenges, hardest_part,
          current_level, native_language, known_words_1, known_words_2,
          work_scenarios, upcoming_occasions, interests, english_style, tutor_style
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23
        ) RETURNING *
      `, [
        fingerprint_id, skill_to_improve, language_statement,
        JSON.stringify(english_usage), industry, speaking_feelings, speaking_frequency,
        JSON.stringify(improvement_areas), main_goal, JSON.stringify(speaking_obstacles),
        gender, JSON.stringify(current_learning_methods), JSON.stringify(learning_challenges),
        hardest_part, current_level, native_language, JSON.stringify(known_words_1),
        JSON.stringify(known_words_2), JSON.stringify(work_scenarios),
        JSON.stringify(upcoming_occasions), JSON.stringify(interests),
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

