const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Database connection WITHOUT SSL for local run
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  // No SSL
});

const runXPMigration = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('🔄 Running XP function migration...');

    const migrationFile = path.join(__dirname, 'migrations', '017_create_xp_calculation_function.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    await client.query(sql);
    console.log('✅ XP function migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
};

runXPMigration();

