const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: {
    rejectUnauthorized: false
  }
});

// Run a single migration file
const runSingleMigration = async (migrationFileName) => {
  let client;
  try {
    client = await pool.connect();
    console.log(`🔄 Running migration: ${migrationFileName}`);

    const migrationPath = path.join(__dirname, 'migrations', migrationFileName);
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query(sql);
    console.log(`✅ Migration ${migrationFileName} completed successfully`);
  } catch (error) {
    console.error(`❌ Error running migration ${migrationFileName}:`, error.message);
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
};

// Get migration file from command line argument
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run-single-migration.js <migration-file-name>');
  process.exit(1);
}

runSingleMigration(migrationFile).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
