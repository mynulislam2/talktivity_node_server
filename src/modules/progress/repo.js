/**
 * Progress Module Repository
 */

const db = require('../../core/db/client');

const progressRepo = {
  async getProgressByUser(userId) {
    return await db.queryOne(`SELECT * FROM user_progress WHERE user_id = $1`, [userId]);
  },
};

module.exports = progressRepo;
