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

async function test() {
  try {
    // Get today from PostgreSQL
    const todayResult = await pool.query('SELECT CURRENT_DATE::text as today');
    const today = todayResult.rows[0].today;
    console.log('PostgreSQL CURRENT_DATE:', today);

    // Test query with explicit date casting
    const result1 = await pool.query(`
      SELECT id, user_id, progress_date, progress_date::text as date_text
      FROM daily_progress
      WHERE user_id = 843 AND progress_date::date = $1::date
    `, [today]);
    
    console.log(`\nQuery with progress_date::date = $1::date (${today}):`);
    console.log('Rows found:', result1.rows.length);
    if (result1.rows.length > 0) {
      result1.rows.forEach(row => {
        console.log(`  ID: ${row.id}, progress_date: ${row.progress_date}, date_text: ${row.date_text}`);
      });
    }

    // Test query without explicit casting
    const result2 = await pool.query(`
      SELECT id, user_id, progress_date, progress_date::text as date_text
      FROM daily_progress
      WHERE user_id = 843 AND progress_date = $1
    `, [today]);
    
    console.log(`\nQuery with progress_date = $1 (${today}):`);
    console.log('Rows found:', result2.rows.length);
    if (result2.rows.length > 0) {
      result2.rows.forEach(row => {
        console.log(`  ID: ${row.id}, progress_date: ${row.progress_date}, date_text: ${row.date_text}`);
      });
    }

    // Check all progress dates for this user
    const allResult = await pool.query(`
      SELECT id, progress_date, progress_date::text as date_text,
             progress_date::date = CURRENT_DATE as matches_today
      FROM daily_progress
      WHERE user_id = 843
      ORDER BY progress_date DESC
    `);
    
    console.log('\nAll progress dates for user 843:');
    allResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, progress_date: ${row.progress_date}, date_text: ${row.date_text}, matches_today: ${row.matches_today}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

test();
