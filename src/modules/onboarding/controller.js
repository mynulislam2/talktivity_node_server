// src/modules/onboarding/controller.js
// Onboarding request handlers

const { 
  saveOnboardingData,
  getOnboardingData
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Save or update onboarding data
const saveOnboarding = async (req, res) => {
  try {
    const onboardingData = req.body;
    
    // Validate user_id
    if (!onboardingData.user_id) {
      return res.status(400).json(errorResponse('user_id is required'));
    }

    const result = await saveOnboardingData(onboardingData);
    
    if (result.success) {
      res.status(result.data ? 200 : 201).json(successResponse(result.data, result.message));
    } else {
      res.status(500).json(errorResponse(result.message || 'Failed to save onboarding data'));
    }
  } catch (error) {
    console.error('Error saving onboarding data:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to save onboarding data';
    if (error.message === 'User not found') {
      errorMessage = 'User not found';
    }
    
    res.status(500).json(errorResponse(errorMessage));
  }
};

// Get onboarding data for a user
const getOnboarding = async (req, res) => {
  try {
    const userId = req.user.userId; // Get from authenticated user
    
    const onboardingData = await getOnboardingData(userId);
    
    if (!onboardingData) {
      return res.status(404).json(errorResponse('Onboarding data not found'));
    }
    
    res.status(200).json(successResponse(onboardingData, 'Onboarding data retrieved successfully'));
  } catch (error) {
    console.error('Error fetching onboarding data:', error);
    res.status(500).json(errorResponse('Failed to retrieve onboarding data'));
  }
};

module.exports = {
  saveOnboarding,
  getOnboarding
};