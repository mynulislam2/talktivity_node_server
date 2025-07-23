// Migration script: create_user_devices_table.js
// Usage: node Agentserver/db/create_user_devices_table.js

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
CREATE TABLE IF NOT EXISTS user_devices (
    user_id UUID NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    last_used TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, device_id)
);
`;

(async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query(createTableSQL);
    console.log('user_devices table created or already exists.');
  } catch (err) {
    console.error('Error creating user_devices table:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
})(); 