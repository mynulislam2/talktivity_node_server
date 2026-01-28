/**
 * Topics Module Controller
 */

const { sendSuccess, sendError } = require('../../core/http/response');
const topicsService = require('./service');

const topicsController = {
  async listTopics(req, res, next) {
    try {
      const userId = req.user.userId;
      const topics = await topicsService.getUserTopics(userId);
      sendSuccess(res, topics, 200, 'Topics retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getTopicDetail(req, res, next) {
    try {
      const { topicId } = req.params;
      const topic = await topicsService.getTopicById(topicId);
      sendSuccess(res, topic, 200, 'Topic retrieved');
    } catch (error) {
      next(error);
    }
  },

  async createTopic(req, res, next) {
    try {
      const userId = req.user.userId;
      const { category, topic } = req.body;

      if (!category || !topic) {
        return sendError(res, 'Category and topic are required', 400);
      }

      const createdTopic = await topicsService.createUserTopic(userId, category, topic);
      sendSuccess(res, createdTopic, 201, 'Topic created successfully');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = topicsController;
