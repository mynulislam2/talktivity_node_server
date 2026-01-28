require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    // Check column type
    const typeResult = await pool.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'daily_progress' AND column_name = 'progress_date'
    `);
    console.log('Column type:', JSON.stringify(typeResult.rows, null, 2));

    // Check actual stored values
    const dataResult = await pool.query(`
      SELECT id, user_id, progress_date, progress_date::text as date_text,
             pg_typeof(progress_date) as pg_type
      FROM daily_progress
      WHERE user_id = 843
      ORDER BY progress_date DESC
      LIMIT 3
    `);
    console.log('\nRecent progress rows:');
    dataResult.rows.forEach(row => console.log(JSON.stringify(row, null, 2)));

    // Check what CURRENT_DATE returns
    const todayResult = await pool.query('SELECT CURRENT_DATE::text as today');
    console.log('\nPostgreSQL CURRENT_DATE:', todayResult.rows[0].today);

    // Test query matching
    const matchResult = await pool.query(`
      SELECT * FROM daily_progress
      WHERE user_id = 843 AND progress_date = CURRENT_DATE
    `);
    console.log('\nRows matching CURRENT_DATE:', matchResult.rows.length);
    if (matchResult.rows.length > 0) {
      console.log('Matched row:', JSON.stringify(matchResult.rows[0], null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

check();
