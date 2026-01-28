/**
 * AI Module Controller
 */

const { sendSuccess, sendError } = require('../../core/http/response');
const aiService = require('./service');

const aiController = {
  async generateRolePlay(req, res, next) {
    try {
      const userId = req.user.userId;
      const { myRole, otherRole, situation } = req.body;

      if (!myRole || !otherRole || !situation) {
        return sendError(res, 'myRole, otherRole, and situation are required', 400);
      }

      const result = await aiService.generateRolePlayScenario(myRole, otherRole, situation);
      sendSuccess(res, result, 200, 'Roleplay scenario generated successfully');
    } catch (error) {
      next(error);
    }
  },

  async generateQuiz(req, res, next) {
    try {
      const userId = req.user.userId;
      const questions = await aiService.generateQuizFromConversations(userId);
      sendSuccess(res, questions, 200, 'Quiz generated successfully');
    } catch (error) {
      next(error);
    }
  },

  async generateListeningQuiz(req, res, next) {
    try {
      const userId = req.user.userId;
      const { conversation } = req.body;

      if (!conversation) {
        return sendError(res, 'conversation is required', 400);
      }

      const questions = await aiService.generateListeningQuizFromConversation(conversation);
      sendSuccess(res, questions, 200, 'Listening quiz generated successfully');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = aiController;
