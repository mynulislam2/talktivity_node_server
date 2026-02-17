/**
 * Onboarding Module Service
 * Extracted from routes/onboarding-routes.js
 * Manages user onboarding profile and setup
 */

const db = require('../../core/db/client');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

const onboardingService = {
  /**
   * Format JSONB data helper
   * Converts various input formats to valid JSON strings
   */
  formatJsonbData(data) {
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
  },

  /**
   * Save or update onboarding data
   * Handles both insert and update using upsert pattern
   */
  async saveOrUpdateOnboarding(userId, onboardingData) {
    let client;
    try {
      const {
        first_name,
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
      } = onboardingData;

      if (!userId) {
        throw new ValidationError('user_id is required');
      }

      client = await db.pool.connect();

      // Validate that user exists
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      // Format JSONB fields properly
      const formattedCurrentLearningMethods = this.formatJsonbData(current_learning_methods);
      const formattedKnownWords1 = this.formatJsonbData(known_words_1);
      const formattedKnownWords2 = this.formatJsonbData(known_words_2);
      const formattedInterests = this.formatJsonbData(interests);
      const formattedTutorStyle = this.formatJsonbData(tutor_style);

      // Check if onboarding data already exists for this user
      const existingResult = await client.query(
        'SELECT id FROM onboarding_data WHERE user_id = $1',
        [userId]
      );

      let result;

      // Only select the 15 fields we actually use (exclude legacy fields)
      const selectedFields = `
        id, user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, current_learning_methods,
        current_level, native_language, known_words_1,
        known_words_2, interests, english_style, tutor_style,
        created_at, updated_at
      `;

      if (existingResult.rows.length > 0) {
        // Update existing onboarding data
        result = await client.query(`
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
          RETURNING ${selectedFields}
        `, [
          userId, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, formattedCurrentLearningMethods,
          current_level, native_language, formattedKnownWords1,
          formattedKnownWords2, formattedInterests, english_style, formattedTutorStyle
        ]);
      } else {
        // Insert new onboarding data
        result = await client.query(`
          INSERT INTO onboarding_data (
            user_id, skill_to_improve, language_statement,
            industry, speaking_feelings, speaking_frequency,
            main_goal, gender, current_learning_methods,
            current_level, native_language, known_words_1,
            known_words_2, interests, english_style, tutor_style
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16::jsonb)
          RETURNING ${selectedFields}
        `, [
          userId, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, formattedCurrentLearningMethods,
          current_level, native_language, formattedKnownWords1,
          formattedKnownWords2, formattedInterests, english_style, formattedTutorStyle
        ]);
      }

      // Check if all required fields are filled
      const data = result.rows[0];
      const requiredFields = [
        'skill_to_improve', 'language_statement', 'industry', 'speaking_feelings',
        'speaking_frequency', 'main_goal', 'gender', 'current_learning_methods',
        'current_level', 'native_language', 'known_words_1', 'known_words_2',
        'interests', 'english_style', 'tutor_style'
      ];

      const allFieldsFilled = requiredFields.every(field => {
        const value = data[field];
        if (Array.isArray(value) || (value && typeof value === 'object')) {
          return Array.isArray(value) ? value.length > 0 : true;
        }
        return value !== null && value !== undefined && value !== '';
      });

      // Update user_lifecycle.onboarding_completed only
      // onboarding_data table is the single source of truth for onboarding data
      // No need to store onboarding_steps in user_lifecycle
      await client.query(
        `UPDATE user_lifecycle 
         SET onboarding_completed = $2,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, allFieldsFilled]
      );

      // Update user's full_name if firstName is provided
      if (first_name && first_name.trim().length > 0) {
        await client.query(
          `UPDATE users 
           SET full_name = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [first_name.trim(), userId]
        );
      }

      return result.rows[0];
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }

      // Handle specific database errors
      let errorMessage = 'Failed to save onboarding data';
      if (error.code === '23505') { // Unique constraint violation
        errorMessage = 'Onboarding data already exists for this user';
      } else if (error.code === '23503') { // Foreign key violation
        errorMessage = 'Invalid user_id provided';
      } else if (error.code === '22P02') { // Invalid text representation
        errorMessage = 'Invalid data format provided';
      }

      throw new ValidationError(errorMessage);
    } finally {
      if (client) {
        client.release();
      }
    }
  },

  // Removed getOnboardingByUserId. Use lifecycle API for onboarding and lifecycle details.
};

module.exports = onboardingService;
