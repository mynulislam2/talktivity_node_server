/**
 * Vocabulary Module Repository
 */

const db = require('../../core/db/client');

const vocabularyRepo = {
  async getVocabularyById(vocabularyId) {
    return await db.queryOne(`SELECT * FROM vocabulary WHERE id = $1`, [vocabularyId]);
  },

  async getUserLearned(userId) {
    return await db.queryAll(
      `SELECT v.* FROM vocabulary v
       INNER JOIN user_vocabulary uv ON v.id = uv.vocabulary_id
       WHERE uv.user_id = $1 AND uv.is_learned = true`,
      [userId]
    );
  },
};

module.exports = vocabularyRepo;
