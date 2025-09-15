// src/modules/topics/controller.js
// Topics request handlers

const { 
  createNewTopic,
  createBulkNewTopics,
  fetchAllTopics,
  fetchTopicByCategory,
  generateRoleplayScenario
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Create a single topic
const createTopic = async (req, res) => {
  try {
    const { category, topic } = req.body;

    // Basic validation
    if (!category || typeof category !== 'string' || category.trim() === '') {
      return res.status(400).json(errorResponse('Category name is required and must be a non-empty string.'));
    }
    if (!topic || typeof topic !== 'object' || Array.isArray(topic)) {
      return res.status(400).json(errorResponse('A single topic object is required.'));
    }
    if (!topic.title || !topic.prompt || !topic.firstPrompt) {
      return res.status(400).json(errorResponse('The topic must have a title, prompt, and firstPrompt.'));
    }

    const result = await createNewTopic(category, topic);

    res.status(200).json(successResponse(result, 'Topic saved/updated successfully'));
  } catch (error) {
    console.error('Error saving topic data:', error);
    res.status(500).json(errorResponse(error, 'Unable to save topic data at this time. Please try again later.'));
  }
};

// Create multiple topics in bulk
const createBulkTopics = async (req, res) => {
  try {
    const categories = req.body;
    
    if (!Array.isArray(categories)) {
      return res.status(400).json(errorResponse('Request body must be an array of { category, topics } objects.'));
    }

    const results = await createBulkNewTopics(categories);

    res.status(200).json(successResponse(results, 'Bulk topics saved/updated successfully'));
  } catch (error) {
    console.error('Error in bulk topic upload:', error);
    res.status(500).json(errorResponse(error, 'Unable to upload topics at this time. Please try again later.'));
  }
};

// Get all topic categories
const getAllTopics = async (req, res) => {
  try {
    const topics = await fetchAllTopics();
    
    res.status(200).json(successResponse(topics));
  } catch (error) {
    console.error('Error fetching topic categories:', error);
    res.status(500).json(errorResponse(error, 'Unable to retrieve topic categories at this time. Please try again later.'));
  }
};

// Get a specific topic category by name
const getTopicByCategory = async (req, res) => {
  try {
    const { category_name } = req.params;
    
    if (!category_name) {
      return res.status(400).json(errorResponse('Category name is required'));
    }

    const topic = await fetchTopicByCategory(category_name);
    
    if (!topic) {
      return res.status(404).json(errorResponse('Topic category not found'));
    }

    res.status(200).json(successResponse(topic));
  } catch (error) {
    console.error(`Error fetching topic category '${req.params.category_name}':`, error);
    res.status(500).json(errorResponse(error, 'Unable to retrieve topic category at this time. Please try again later.'));
  }
};

// Generate a roleplay scenario using AI
const generateRoleplay = async (req, res) => {
  try {
    const { myRole, otherRole, situation } = req.body;

    if (!myRole || !otherRole || !situation) {
      return res.status(400).json(errorResponse('Missing required fields: myRole, otherRole, situation'));
    }

    const result = await generateRoleplayScenario(myRole, otherRole, situation);
    
    res.status(200).json(successResponse(result.data, 'Roleplay scenario generated successfully'));
  } catch (error) {
    console.error('Error generating roleplay scenario:', error);
    res.status(500).json(errorResponse(error.message || 'Failed to generate roleplay scenario'));
  }
};

module.exports = {
  createTopic,
  createBulkTopics,
  getAllTopics,
  getTopicByCategory,
  generateRoleplay
};