/**
 * Core DB Client
 * Wrapper around existing db pool with query helpers
 */

const db = require('../../../db');

class DBClient {
  constructor(pool = db.pool) {
    this.pool = pool;
  }

  async query(text, params = []) {
    const client = await this.pool.connect();
    try {
      // Set query timeout to 60 seconds (prevents queries from hanging indefinitely)
      await client.query('SET statement_timeout = 60000');
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      // Set query timeout for transaction (2 minutes for transactions)
      await client.query('SET statement_timeout = 120000');
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async queryOne(text, params = []) {
    const result = await this.query(text, params);
    return result.rows[0] || null;
  }

  async queryAll(text, params = []) {
    const result = await this.query(text, params);
    return result.rows;
  }
}

module.exports = new DBClient();
