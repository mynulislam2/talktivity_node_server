// routes/onboarding-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { authenticateToken } = require('./auth-routes');

// Helper function to validate and format JSONB data
const formatJsonbData = (data) => {
  if (Array.isArray(data)) {
    return JSON.stringify(data);
  }
  if (typeof data === 'string') {
    try {
      // If it's already a JSON string, validate it
      JSON.parse(data);
      return data;
    } catch {
      // If it's not valid JSON, wrap it in an array
      return JSON.stringify([data]);
    }
  }
  return JSON.stringify([]);
};

// POST /api/onboarding - Save or update onboarding data (with authentication)
router.post('/onboarding', authenticateToken, async (req, res) => {
  let client;
  try {
    console.log('Onboarding request received:', {
      user_id: req.body.user_id,
      skill_to_improve: req.body.skill_to_improve,
      has_arrays: {
        current_learning_methods: Array.isArray(req.body.current_learning_methods),
        known_words_1: Array.isArray(req.body.known_words_1),
        known_words_2: Array.isArray(req.body.known_words_2),
        interests: Array.isArray(req.body.interests),
        tutor_style: Array.isArray(req.body.tutor_style)
      }
    });

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

    // Validate that user exists
    client = await pool.connect();
    console.log('Database connection established');
    
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      console.log('User not found:', user_id);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    console.log('User found:', user_id);

    // Format JSONB fields properly
    const formattedCurrentLearningMethods = formatJsonbData(current_learning_methods);
    const formattedKnownWords1 = formatJsonbData(known_words_1);
    const formattedKnownWords2 = formatJsonbData(known_words_2);
    const formattedInterests = formatJsonbData(interests);
    const formattedTutorStyle = formatJsonbData(tutor_style);

    console.log('Formatted JSONB data:', {
      current_learning_methods: formattedCurrentLearningMethods,
      known_words_1: formattedKnownWords1,
      known_words_2: formattedKnownWords2,
      interests: formattedInterests,
      tutor_style: formattedTutorStyle
    });

    // Check if onboarding data already exists for this user
    const existingResult = await client.query(
      'SELECT id FROM onboarding_data WHERE user_id = $1',
      [user_id]
    );

    if (existingResult.rows.length > 0) {
      console.log('Updating existing onboarding data for user:', user_id);
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
          current_learning_methods = $9::jsonb,
          current_level = $10,
          native_language = $11,
          known_words_1 = $12::jsonb,
          known_words_2 = $13::jsonb,
          interests = $14::jsonb,
          english_style = $15,
          tutor_style = $16::jsonb,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [
        user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, formattedCurrentLearningMethods,
        current_level, native_language, formattedKnownWords1,
        formattedKnownWords2, formattedInterests, english_style, formattedTutorStyle
      ]);

      console.log('Onboarding data updated successfully');
      res.json({
        success: true,
        message: 'Onboarding data updated successfully',
        data: updateResult.rows[0]
      });
    } else {
      console.log('Inserting new onboarding data for user:', user_id);
      // Insert new onboarding data
      const insertResult = await client.query(`
        INSERT INTO onboarding_data (
          user_id, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, current_learning_methods,
          current_level, native_language, known_words_1,
          known_words_2, interests, english_style, tutor_style
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16::jsonb)
        RETURNING *
      `, [
        user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, formattedCurrentLearningMethods,
        current_level, native_language, formattedKnownWords1,
        formattedKnownWords2, formattedInterests, english_style, formattedTutorStyle
      ]);

      console.log('Onboarding data inserted successfully');
      res.status(201).json({
        success: true,
        message: 'Onboarding data saved successfully',
        data: insertResult.rows[0]
      });
    }

  } catch (error) {
    console.error('Error saving onboarding data:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      where: error.where
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to save onboarding data';
    if (error.code === '23505') { // Unique constraint violation
      errorMessage = 'Onboarding data already exists for this user';
    } else if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Invalid user_id provided';
    } else if (error.code === '22P02') { // Invalid text representation
      errorMessage = 'Invalid data format provided';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      
    });
  } finally {
    if (client) {
      client.release();
      console.log('Database connection released');
    }
  }
});

// POST /api/onboarding/test - Test endpoint with authentication
router.post('/onboarding/test', authenticateToken, async (req, res) => {
  let client;
  try {
    console.log('Test onboarding request received:', {
      user_id: req.body.user_id,
      skill_to_improve: req.body.skill_to_improve,
      has_arrays: {
        current_learning_methods: Array.isArray(req.body.current_learning_methods),
        known_words_1: Array.isArray(req.body.known_words_1),
        known_words_2: Array.isArray(req.body.known_words_2),
        interests: Array.isArray(req.body.interests),
        tutor_style: Array.isArray(req.body.tutor_style)
      }
    });

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

    // Validate that user exists
    client = await pool.connect();
    console.log('Database connection established');
    
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      console.log('User not found:', user_id);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    console.log('User found:', user_id);

    // Format JSONB fields properly
    const formattedCurrentLearningMethods = formatJsonbData(current_learning_methods);
    const formattedKnownWords1 = formatJsonbData(known_words_1);
    const formattedKnownWords2 = formatJsonbData(known_words_2);
    const formattedInterests = formatJsonbData(interests);
    const formattedTutorStyle = formatJsonbData(tutor_style);

    console.log('Formatted JSONB data:', {
      current_learning_methods: formattedCurrentLearningMethods,
      known_words_1: formattedKnownWords1,
      known_words_2: formattedKnownWords2,
      interests: formattedInterests,
      tutor_style: formattedTutorStyle
    });

    // Check if onboarding data already exists for this user
    const existingResult = await client.query(
      'SELECT id FROM onboarding_data WHERE user_id = $1',
      [user_id]
    );

    if (existingResult.rows.length > 0) {
      console.log('Updating existing onboarding data for user:', user_id);
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
          current_learning_methods = $9::jsonb,
          current_level = $10,
          native_language = $11,
          known_words_1 = $12::jsonb,
          known_words_2 = $13::jsonb,
          interests = $14::jsonb,
          english_style = $15,
          tutor_style = $16::jsonb,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `, [
        user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, formattedCurrentLearningMethods,
        current_level, native_language, formattedKnownWords1,
        formattedKnownWords2, formattedInterests, english_style, formattedTutorStyle
      ]);

      console.log('Onboarding data updated successfully');
      res.json({
        success: true,
        message: 'Onboarding data updated successfully',
        data: updateResult.rows[0]
      });
    } else {
      console.log('Inserting new onboarding data for user:', user_id);
      // Insert new onboarding data
      const insertResult = await client.query(`
        INSERT INTO onboarding_data (
          user_id, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, current_learning_methods,
          current_level, native_language, known_words_1,
          known_words_2, interests, english_style, tutor_style
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16::jsonb)
        RETURNING *
      `, [
        user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, formattedCurrentLearningMethods,
        current_level, native_language, formattedKnownWords1,
        formattedKnownWords2, formattedInterests, english_style, formattedTutorStyle
      ]);

      console.log('Onboarding data inserted successfully');
      res.status(201).json({
        success: true,
        message: 'Onboarding data saved successfully',
        data: insertResult.rows[0]
      });
    }

  } catch (error) {
    console.error('Error saving onboarding data:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      where: error.where
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to save onboarding data';
    if (error.code === '23505') { // Unique constraint violation
      errorMessage = 'Onboarding data already exists for this user';
    } else if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Invalid user_id provided';
    } else if (error.code === '22P02') { // Invalid text representation
      errorMessage = 'Invalid data format provided';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      
    });
  } finally {
    if (client) {
      client.release();
      console.log('Database connection released');
    }
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

