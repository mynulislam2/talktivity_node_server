// src/modules/topics/service.js
// Topics business logic

const { generateRoleplay } = require('../../core/ai');
const { 
  saveTopic,
  saveBulkTopics,
  getAllTopicCategories,
  getTopicCategoryByName
} = require('./repo');

const createNewTopic = async (category, topic) => {
  if (!category || !topic) {
    throw new Error('Category and topic are required');
  }
  
  return await saveTopic(category, topic);
};

const createBulkNewTopics = async (categories) => {
  if (!Array.isArray(categories)) {
    throw new Error('Categories must be an array');
  }
  
  return await saveBulkTopics(categories);
};

const fetchAllTopics = async () => {
  return await getAllTopicCategories();
};

const fetchTopicByCategory = async (categoryName) => {
  if (!categoryName) {
    throw new Error('Category name is required');
  }
  
  return await getTopicCategoryByName(categoryName);
};

// Generate a roleplay scenario using AI
const generateRoleplayScenario = async (myRole, otherRole, situation) => {
  try {
    const result = await generateRoleplay(myRole, otherRole, situation);
    return result;
  } catch (error) {
    console.error('Error generating roleplay scenario:', error);
    throw new Error(error.message || 'Failed to generate roleplay scenario');
  }
};

module.exports = {
  createNewTopic,
  createBulkNewTopics,
  fetchAllTopics,
  fetchTopicByCategory,
  generateRoleplayScenario
};