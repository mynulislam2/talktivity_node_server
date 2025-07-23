const { Pool } = require('pg');

const pool = new Pool({
  host: 'dpg-d1giokqli9vc73an51vg-a.singapore-postgres.render.com',
  port: 5432,
  user: 'talktivity',
  password: 'gYmROfudwrUt7HJwRiNgYchzlytxCx5q',
  database: 'talktivity_postgres_sql',
  ssl: { rejectUnauthorized: false }
});

const createTableSQL = `
CREATE TABLE IF NOT EXISTS topic_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(255) NOT NULL UNIQUE,
    topics JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 
`;

(async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query(createTableSQL);
    console.log('✅ topic_categories table created or already exists.');
  } catch (err) {
    console.error('❌ Error creating topic_categories table:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
})(); 