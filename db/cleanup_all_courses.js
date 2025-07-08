require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: '1234',
  database: 'postgres',
});

async function cleanupAllCourses() {
  const client = await pool.connect();
  try {
    console.log('Deleting all user courses...');
    await client.query('DELETE FROM user_courses');
    console.log('✅ All user courses deleted.');
  } catch (err) {
    console.error('❌ Error deleting user courses:', err);
  } finally {
    client.release();
    process.exit();
  }
}

cleanupAllCourses(); 