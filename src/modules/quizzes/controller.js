/**
 * Quizzes Module Controller
 */

const quizzesService = require('./service');

const quizzesController = {
  async generateQuiz(req, res, next) {
    try {
      const userId = req.user.id || req.user.userId;
      const questions = await quizzesService.generateQuizFromConversations(userId);
      res.json({ success: true, data: questions });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = quizzesController;
