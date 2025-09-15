// src/modules/listening/controller.js
// Listening request handlers

const { 
  fetchListeningTopics,
  fetchCourseStatus,
  initializeCourse
} = require('./service');
const { successResponse, errorResponse } = require('../../core/http/response');

// Get all listening topics
const getListeningTopics = async (req, res) => {
  try {
    const topics = await fetchListeningTopics();
    res.status(200).json(successResponse(topics, 'Listening topics retrieved successfully'));
  } catch (error) {
    console.error('Error fetching listening topics:', error);
    res.status(500).json(errorResponse('Unable to retrieve listening topics at this time. Please try again later.'));
  }
};

// Get current course status
const getCourseStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const status = await fetchCourseStatus(userId);
    res.status(200).json(successResponse(status, 'Course status retrieved successfully'));
  } catch (error) {
    console.error('Error fetching course status:', error);
    if (error.message === 'No active course found') {
      return res.status(404).json(errorResponse('No active course found'));
    }
    res.status(500).json(errorResponse('Unable to retrieve course status at this time. Please try again later.'));
  }
};

// Initialize a new course
const createCourse = async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await initializeCourse(userId);
    res.status(201).json(successResponse(result.data, result.message));
  } catch (error) {
    console.error('Error initializing course:', error);
    if (error.message === 'Onboarding data not found. Please complete onboarding first.') {
      return res.status(400).json(errorResponse('Onboarding data not found. Please complete onboarding first.'));
    }
    res.status(500).json(errorResponse('Failed to initialize course'));
  }
};

module.exports = {
  getListeningTopics,
  getCourseStatus,
  createCourse
};