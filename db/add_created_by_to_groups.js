const { Pool } = require('pg');

const pool = new Pool({
  host: 'dpg-d1giokqli9vc73an51vg-a.singapore-postgres.render.com',
  port: 5432,
  user: 'talktivity',
  password: 'gYmROfudwrUt7HJwRiNgYchzlytxCx5q',
  database: 'talktivity_postgres_sql',
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