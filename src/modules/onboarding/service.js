// src/modules/onboarding/service.js
// Onboarding business logic

const db = require('../../core/db/client');

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

// Save or update onboarding data
const saveOnboardingData = async (onboardingData) => {
  let client;
  try {
    const {
      user_id,
      skill_to_improve, language_statement, industry,
      speaking_feelings, speaking_frequency, main_goal,
      gender, current_learning_methods, current_level,
      native_language, known_words_1, known_words_2,
      interests, english_style, tutor_style
    } = onboardingData;

    if (!user_id) {
      throw new Error('user_id is required');
    }

    // Validate that user exists
    client = await db.pool.connect();
    
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      throw new Error('User not found');
    }

    // Format JSONB fields properly
    const formattedCurrentLearningMethods = formatJsonbData(current_learning_methods);
    const formattedKnownWords1 = formatJsonbData(known_words_1);
    const formattedKnownWords2 = formatJsonbData(known_words_2);
    const formattedInterests = formatJsonbData(interests);
    const formattedTutorStyle = formatJsonbData(tutor_style);

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

      return {
        success: true,
        message: 'Onboarding data updated successfully',
        data: updateResult.rows[0]
      };
    } else {
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

      return {
        success: true,
        message: 'Onboarding data saved successfully',
        data: insertResult.rows[0]
      };
    }

  } finally {
    if (client) {
      client.release();
    }
  }
};

// Get onboarding data for a user
const getOnboardingData = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();
    
    const result = await client.query(
      'SELECT * FROM onboarding_data WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } finally {
    if (client) {
      client.release();
    }
  }
};

module.exports = {
  saveOnboardingData,
  getOnboardingData
};