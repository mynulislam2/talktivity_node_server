/**
 * Listening Module Controller
 * Two endpoints: Generate listening quiz from topic + Get audio
 */

const listeningTopics = require('../../../listening-topics');
const listeningService = require('./service');

// Deterministic topic selector so week/day consistently map to a record
function pickTopic(week, day) {
  const weekNum = Number(week) || 1;
  const dayNum = Number(day) || 1;
  const index = (((weekNum - 1) * 7) + (dayNum - 1)) % listeningTopics.length;
  return listeningTopics[index] || listeningTopics[0];
}

const listeningController = {
  /**
   * Generate listening quiz from listening topic data + AI
   */
  async generateListeningQuiz(req, res, next) {
    try {
      const { week, day } = req.body || {};
      const topic = pickTopic(week, day);

      // Generate quiz using topic conversation data
      const quizQuestions = await listeningService.generateListeningQuizFromTopic(topic);

      res.json({
        success: true,
        data: {
          topicId: topic.id,
          title: topic.title,
          category: topic.category,
          week: Number(week) || 1,
          day: Number(day) || 1,
          audio_url: topic.audio,
          conversation: topic.conversation,
          quiz: quizQuestions,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get listening audio URL
   */
  async getListeningAudio(req, res, next) {
    try {
      const { week, day } = req.query || {};
      const topic = pickTopic(week, day);

      res.json({
        success: true,
        data: {
          topicId: topic.id,
          title: topic.title,
          audio_url: topic.audio,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = listeningController;
