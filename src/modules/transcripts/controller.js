// src/modules/transcripts/controller.js
// Transcripts request handlers

const { 
  createTranscript,
  fetchLatestConversations,
  checkUserConversationExperience
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Store conversation transcript
const store = async (req, res) => {
  try {
    const { user_id, transcript, room_name, session_duration, agent_state } = req.body;

    const result = await createTranscript(user_id, transcript, room_name, session_duration, agent_state);

    res.status(201).json(successResponse(result, "Transcript stored successfully"));
  } catch (error) {
    console.error('Error storing conversation:', error);
    res.status(500).json(errorResponse(error, "Unable to store conversation at this time. Please try again later."));
  }
};

// Get latest conversations for a specific user
const getLatest = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    // Validate userId
    if (isNaN(parseInt(userId))) {
      return res.status(400).json(errorResponse('User ID must be a number'));
    }

    const result = await fetchLatestConversations(userId, limit, offset);

    // Calculate pagination info
    const paginationInfo = {
      total: result.total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: result.total > (parseInt(offset) + parseInt(limit))
    };

    res.json(successResponse({
      conversations: result.conversations,
      pagination: paginationInfo
    }));
  } catch (error) {
    console.error('Error fetching latest conversations:', error);
    res.status(500).json(errorResponse(error, "Unable to retrieve conversations at this time. Please try again later."));
  }
};

// Check if user has conversation experience
const checkExperience = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (isNaN(parseInt(userId))) {
      return res.status(400).json(errorResponse('User ID must be a number'));
    }

    const result = await checkUserConversationExperience(userId);

    res.json(successResponse(result));
  } catch (error) {
    console.error('Error checking conversation experience:', error);
    res.status(500).json(errorResponse(error, "Unable to check conversation experience at this time. Please try again later."));
  }
};

module.exports = {
  store,
  getLatest,
  checkExperience
};