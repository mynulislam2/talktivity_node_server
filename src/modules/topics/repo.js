/**
 * Topics Module Repository
 */

const db = require('../../core/db/client');

const topicsRepo = {
  async getTopicById(topicId) {
    return await db.queryOne(`SELECT * FROM topics WHERE id = $1`, [topicId]);
  },

  async getTopicsByCourseWeek(courseWeek) {
    return await db.queryAll(`SELECT * FROM topics WHERE course_week = $1`, [courseWeek]);
  },

  async getUserPersonalizedTopics(userId) {
    return await db.queryAll(
      `SELECT * FROM personalized_topics WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
  },
};

module.exports = topicsRepo;
