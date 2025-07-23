const { Pool } = require('pg');

const pool = new Pool({
  host: 'dpg-d1giokqli9vc73an51vg-a.singapore-postgres.render.com',
  port: 5432,
  user: 'talktivity',
  password: 'gYmROfudwrUt7HJwRiNgYchzlytxCx5q',
  database: 'talktivity_postgres_sql',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('DELETE FROM topic_categories;');
    console.log('✅ All topic_categories data wiped.');
  } catch (err) {
    console.error('❌ Error wiping topic_categories data:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
})(); 