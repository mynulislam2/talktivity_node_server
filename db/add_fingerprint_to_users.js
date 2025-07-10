const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5433'),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '1234',
  database: process.env.PG_DATABASE || 'postgres',
});

async function addFingerprintToUsers() {
  let client;
  try {
    client = await pool.connect();
    console.log('🔄 Adding fingerprint_id column to users table...');

    // Check if column already exists
    const columnExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'fingerprint_id'
    `);

    if (columnExists.rows.length > 0) {
      console.log('✅ fingerprint_id column already exists in users table');
      return;
    }

    // Add fingerprint_id column
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN fingerprint_id VARCHAR(255)
    `);

    console.log('✅ Successfully added fingerprint_id column to users table');

    // Create index for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_fingerprint_id ON users(fingerprint_id)
    `);

    console.log('✅ Created index on fingerprint_id column');

    // Show current users
    const usersResult = await client.query(`
      SELECT id, email, full_name, fingerprint_id 
      FROM users 
      ORDER BY id
    `);

    console.log('\n📋 Current users:');
    usersResult.rows.forEach(user => {
      console.log(`  - User ${user.id} (${user.email}): ${user.fingerprint_id || 'No fingerprint'}`);
    });

    console.log('\n🎯 Next steps:');
    console.log('1. Users need to log out and log back in to link their fingerprint');
    console.log('2. The system will automatically link fingerprint_id during login');
    console.log('3. Personalized courses will then work correctly');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run the function
addFingerprintToUsers().catch(console.error); 