require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '1234',
  database: process.env.PG_DATABASE || 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function deleteUserAndAllData(email) {
  let client;
  try {
    client = await pool.connect();
    console.log(`🔍 Looking up user with email: ${email}`);
    const userResult = await client.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      console.log('❌ No user found with that email.');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`🗑️ Deleting user ID ${userId} (${email}) and all related data...`);
    const deleteResult = await client.query('DELETE FROM users WHERE id = $1', [userId]);
    if (deleteResult.rowCount > 0) {
      console.log('✅ User and all related data deleted successfully.');
    } else {
      console.log('❌ Failed to delete user.');
    }
  } catch (error) {
    console.error('❌ Error deleting user and data:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Usage: node db/delete_user_and_all_data.js user@example.com
if (require.main === module) {
  const email = 'homeexercise8@gmail.com';
  if (!email) {
    console.error('Usage: node db/delete_user_and_all_data.js user@example.com');
    process.exit(1);
  }
  deleteUserAndAllData(email);
} 