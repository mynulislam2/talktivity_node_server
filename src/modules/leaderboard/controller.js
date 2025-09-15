// src/modules/leaderboard/controller.js
// Leaderboard request handlers

const { 
  fetchWeeklyLeaderboard,
  fetchOverallLeaderboard,
  fetchUserPosition
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Get weekly leaderboard
const getWeeklyLeaderboard = async (req, res) => {
  let client;
  try {
    const result = await fetchWeeklyLeaderboard();
    res.status(200).json(successResponse(result, 'Weekly leaderboard retrieved successfully'));
  } catch (error) {
    console.error('Error getting weekly leaderboard:', error);
    res.status(500).json(errorResponse('Failed to get weekly leaderboard'));
  }
};

// Get overall leaderboard
const getOverallLeaderboard = async (req, res) => {
  try {
    const result = await fetchOverallLeaderboard();
    res.status(200).json(successResponse(result, 'Overall leaderboard retrieved successfully'));
  } catch (error) {
    console.error('Error getting overall leaderboard:', error);
    res.status(500).json(errorResponse('Failed to get overall leaderboard'));
  }
};

// Get user's position in leaderboard
const getUserPosition = async (req, res) => {
  try {
    const { type = 'weekly' } = req.query;
    const userId = req.user.userId;
    
    const result = await fetchUserPosition(userId, type);
    res.status(200).json(successResponse(result, 'User position retrieved successfully'));
  } catch (error) {
    console.error('Error getting user position:', error);
    res.status(500).json(errorResponse('Failed to get user position'));
  }
};

module.exports = {
  getWeeklyLeaderboard,
  getOverallLeaderboard,
  getUserPosition
};