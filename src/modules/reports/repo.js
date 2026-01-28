/**
 * Reports Module Repository
 */

const db = require('../../core/db/client');

const reportsRepo = {
  async getReportById(reportId) {
    return await db.queryOne(`SELECT * FROM reports WHERE id = $1`, [reportId]);
  },

  async getUserReportsByDateRange(userId, startDate, endDate) {
    return await db.queryAll(
      `SELECT * FROM reports WHERE user_id = $1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC`,
      [userId, startDate, endDate]
    );
  },

  async createReport(userId, data) {
    const { conversationId, vocabularyScore, grammarScore, fluencyScore } = data;
    return await db.queryOne(
      `INSERT INTO reports (user_id, conversation_id, vocabulary_score, grammar_score, fluency_score, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [userId, conversationId, vocabularyScore, grammarScore, fluencyScore]
    );
  },
};

module.exports = reportsRepo;
