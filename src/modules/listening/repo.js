/**
 * Listening Module Repository
 */

const db = require('../../core/db/client');

const listeningRepo = {
  async getMaterialById(materialId) {
    return await db.queryOne(`SELECT * FROM listening_materials WHERE id = $1`, [materialId]);
  },

  async getAllMaterials() {
    return await db.queryAll(`SELECT * FROM listening_materials ORDER BY created_at DESC`);
  },
};

module.exports = listeningRepo;
