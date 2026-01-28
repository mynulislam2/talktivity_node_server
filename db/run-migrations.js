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

// Run migration files
const runMigrations = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('🔄 Starting database migrations...');

    const safeRollback = async () => {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore (no active transaction / already rolled back)
      }
    };

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`Running migration: ${file}`);
      
      try {
        await client.query(sql);
        console.log(`✅ Migration ${file} completed successfully`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          // Some migration files wrap statements in BEGIN/COMMIT.
          // If they fail mid-transaction and we "skip", we must rollback or the connection stays aborted.
          await safeRollback();
          console.log(`⚠️  Migration ${file} already applied, skipping...`);
        } else {
          await safeRollback();
          console.error(`❌ Error running migration ${file}:`, error.message);
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
};

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
