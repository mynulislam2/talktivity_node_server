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
const saveOnboardingData = async (onboardingData, options = {}) => {
  const { testMode = false } = options;
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
      return {
        success: false,
        error: 'user_id is required'
      };
    }

    client = await db.pool.connect();
    console.log(`${testMode ? 'Test' : ''} Database connection established`);

    // Validate that user exists
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      console.log('User not found:', user_id);
      return {
        success: false,
        error: 'User not found'
      };
    }
    console.log('User found:', user_id);

    // Format JSONB fields properly
    const formattedCurrentLearningMethods = formatJsonbData(current_learning_methods);
    const formattedKnownWords1 = formatJsonbData(known_words_1);
    const formattedKnownWords2 = formatJsonbData(known_words_2);
    const formattedInterests = formatJsonbData(interests);
    const formattedTutorStyle = formatJsonbData(tutor_style);

    if (!testMode) {
      console.log('Formatted JSONB data:', {
        current_learning_methods: formattedCurrentLearningMethods,
        known_words_1: formattedKnownWords1,
        known_words_2: formattedKnownWords2,
        interests: formattedInterests,
        tutor_style: formattedTutorStyle
      });
    }

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
      return {
        success: true,
        inserted: false,
        data: updateResult.rows[0]
      };
    } else {
      console.log('Inserting new onboarding data for user:', user_id);
      
      // Insert new onboarding data
      const insertResult = await client.query(`
        INSERT INTO onboarding_data (
          user_id, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, current_learning_methods,
          current_level, native_language, known_words_1,
          known_words_2, interests, english_style, tutor_style,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16::jsonb, NOW())
        RETURNING *
      `, [
        user_id, skill_to_improve, language_statement,
        industry, speaking_feelings, speaking_frequency,
        main_goal, gender, formattedCurrentLearningMethods,
        current_level, native_language, formattedKnownWords1,
        formattedKnownWords2, formattedInterests, english_style, formattedTutorStyle
      ]);

      console.log('Onboarding data inserted successfully');
      return {
        success: true,
        inserted: true,
        data: insertResult.rows[0]
      };
    }
  } catch (error) {
    console.error(`${testMode ? 'Test ' : ''}Error saving onboarding data:`, error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to save onboarding data';
    if (error.code === '23505') { // Unique constraint violation
      errorMessage = 'Onboarding data already exists for this user';
    } else if (error.code === '23503') { // Foreign key violation
      errorMessage = 'Invalid user_id provided';
    } else if (error.code === '22P02') { // Invalid text representation
      errorMessage = 'Invalid data format provided';
    }

    return {
      success: false,
      error: errorMessage
    };
  } finally {
    if (client) {
      client.release();
      console.log(`${testMode ? 'Test ' : ''}Database connection released`);
    }
  }
};

// Get onboarding data for a user
const getOnboardingData = async (userId, options = {}) => {
  const { ownData = false, requestingUserId, allowAnyUser = false } = options;
  let client;
  
  try {
    if (!userId) {
      return {
        success: false,
        error: 'user_id is required'
      };
    }

    client = await db.pool.connect();
    console.log(`Fetching onboarding data for user: ${userId}`);

    // Authorization check if not getting own data
    if (!ownData && !allowAnyUser) {
      // Check if requesting user can access this data
      const authCheck = await client.query(`
        SELECT 
          u.id,
          u.role,
          u.is_teacher,
          CASE WHEN u.id = $2 THEN true ELSE false END as is_self
        FROM users u 
        WHERE u.id = $2
      `, [userId, requestingUserId]);

      if (authCheck.rows.length === 0) {
        return {
          success: false,
          unauthorized: true,
          error: 'Requesting user not found'
        };
      }

      const user = authCheck.rows[0];
      const hasPermission = user.role === 'admin' || 
                           user.is_teacher || 
                           user.is_self;

      if (!hasPermission) {
        return {
          success: false,
          unauthorized: true,
          error: 'Insufficient permissions to access this user data'
        };
      }
    }

    // Get the onboarding data
    const result = await client.query(
      'SELECT * FROM onboarding_data WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        notFound: true,
        error: 'Onboarding data not found'
      };
    }

    console.log('Onboarding data retrieved successfully for user:', userId);
    return {
      success: true,
      data: result.rows[0]
    };
  } catch (error) {
    console.error('Service error fetching onboarding data:', error);
    return {
      success: false,
      error: 'Failed to fetch onboarding data'
    };
  } finally {
    if (client) {
      client.release();
      console.log('Database connection released');
    }
  }
};

module.exports = {
  saveOnboardingData,
  getOnboardingData
};