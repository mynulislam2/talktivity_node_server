// src/modules/vocabulary/controller.js
// Vocabulary request handlers

const { fetchVocabularyWords, fetchAllVocabulary } = require('./service');
const { successResponse, errorResponse } = require('../../core/http/response');

// Get all vocabulary
const getAllVocabulary = async (req, res) => {
  try {
    const result = await fetchAllVocabulary();
    
    res.status(200).json(successResponse(result, 'All vocabulary retrieved successfully'));
  } catch (error) {
    console.error('Error fetching all vocabulary:', error);
    res.status(500).json(errorResponse('Failed to fetch vocabulary'));
  }
};

// Get words for specific week and day
const getVocabularyWords = async (req, res) => {
  try {
    const { week, day } = req.params;
    const weekNumber = parseInt(week);
    const dayNumber = parseInt(day);

    // Validate input
    if (isNaN(weekNumber) || isNaN(dayNumber) || weekNumber < 1 || dayNumber < 1 || dayNumber > 7) {
      return res.status(400).json(errorResponse('Invalid week or day number. Week must be >= 1, day must be 1-7.'));
    }

    const result = await fetchVocabularyWords(weekNumber, dayNumber);
    
    if (!result) {
      return res.status(404).json(errorResponse(`No vocabulary data found for week ${weekNumber}, day ${dayNumber}`));
    }

    res.status(200).json(successResponse(result, 'Vocabulary words retrieved successfully'));
  } catch (error) {
    console.error('Error fetching vocabulary words:', error);
    res.status(500).json(errorResponse('Failed to fetch vocabulary words'));
  }
};

module.exports = {
  getAllVocabulary,
  getVocabularyWords
};