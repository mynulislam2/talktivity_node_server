const { Pool } = require('pg');

require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5433'),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '1234',
  database: process.env.PG_DATABASE || 'postgres',
  ssl: { rejectUnauthorized: false }
});

const addCreatedBySQL = `ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`;

(async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query(addCreatedBySQL);
    console.log('✅ created_by column added to groups table (if it did not already exist).');
  } catch (err) {
    console.error('❌ Error adding created_by column:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
})(); 