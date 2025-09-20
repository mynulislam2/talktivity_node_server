const { saveOnboardingData, getOnboardingData } = require('./service');

// Save or update onboarding data
const saveOnboardingDataController = async (req, res) => {
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

    // Security: Ensure user can only modify their own data
    if (req.user && req.user.id !== req.body.user_id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to modify this user data'
      });
    }

    const result = await saveOnboardingData(req.body);
    
    if (result.success) {
      if (result.inserted) {
        res.status(201).json({
          success: true,
          message: 'Onboarding data saved successfully',
          data: result.data
        });
      } else {
        res.json({
          success: true,
          message: 'Onboarding data updated successfully',
          data: result.data
        });
      }
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Controller error saving onboarding data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process onboarding data'
    });
  }
};

// Test endpoint for onboarding data
const saveOnboardingDataTestController = async (req, res) => {
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

    // Security: Ensure user can only modify their own data
    if (req.user && req.user.id !== req.body.user_id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to modify this user data'
      });
    }

    const result = await saveOnboardingData(req.body, { testMode: true });
    
    if (result.success) {
      if (result.inserted) {
        res.status(201).json({
          success: true,
          message: 'Test onboarding data saved successfully',
          data: result.data
        });
      } else {
        res.json({
          success: true,
          message: 'Test onboarding data updated successfully',
          data: result.data
        });
      }
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Controller error saving test onboarding data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process test onboarding data'
    });
  }
};

// Get onboarding data for authenticated user (their own data)
const getOwnOnboardingData = async (req, res) => {
  try {
    const userId = req.user.id; // From JWT token
    console.log('Fetching own onboarding data for user:', userId);

    const result = await getOnboardingData(userId, { ownData: true });

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      if (result.notFound) {
        res.status(404).json({
          success: false,
          error: 'Onboarding data not found'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    }
  } catch (error) {
    console.error('Controller error fetching own onboarding data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch onboarding data'
    });
  }
};

// Get onboarding data by specific user ID (admin/teacher access)
const getOnboardingDataByUserId = async (req, res) => {
  try {
    const { user_id } = req.params;
    const requestingUserId = req.user.id;
    
    console.log('Fetching onboarding data for user_id:', user_id, 'requested by:', requestingUserId);

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    const result = await getOnboardingData(user_id, { 
      requestingUserId,
      allowAnyUser: req.user.role === 'admin' || req.user.is_teacher 
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      if (result.notFound) {
        res.status(404).json({
          success: false,
          error: 'Onboarding data not found'
        });
      } else if (result.unauthorized) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized to access this user data'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    }
  } catch (error) {
    console.error('Controller error fetching onboarding data by user ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch onboarding data'
    });
  }
};

module.exports = {
  saveOnboardingDataController,
  saveOnboardingDataTestController,
  getOwnOnboardingData,
  getOnboardingDataByUserId
};