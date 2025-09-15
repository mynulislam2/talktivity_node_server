// src/modules/quiz/controller.js
// Quiz request handlers

const { 
  createQuizWithAttempts,
  createListeningQuizWithAttempts
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Generate quiz with attempts logic
const generateQuizWithAttempts = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await createQuizWithAttempts(userId);
    
    res.json(successResponse({
      data: result.data,
      attempts: result.attempts
    }, 'Quiz generated successfully'));

  } catch (error) {
    console.error('Error generating quiz with attempts:', error);
    res.status(500).json(errorResponse(error.message || 'Failed to generate quiz'));
  }
};

// Generate listening quiz with attempts logic
const generateListeningQuizWithAttempts = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await createListeningQuizWithAttempts(userId);
    
    res.json(successResponse({
      data: result.data,
      attempts: result.attempts
    }, 'Listening quiz generated successfully'));

  } catch (error) {
    console.error('Error generating listening quiz with attempts:', error);
    res.status(500).json(errorResponse(error.message || 'Failed to generate listening quiz'));
  }
};

module.exports = {
  generateQuizWithAttempts,
  generateListeningQuizWithAttempts
};