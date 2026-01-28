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

// Run only new migrations (034-043)
const runNewMigrations = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('🔄 Starting new database migrations (034-043)...');

    // Get only the new migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .filter(file => {
        const match = file.match(/^(\d+)_/);
        if (match) {
          const num = parseInt(match[1]);
          return num >= 34 && num <= 43;
        }
        return false;
      })
      .sort();

    console.log(`Found ${migrationFiles.length} new migration files`);

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`Running migration: ${file}`);
      
      try {
        await client.query(sql);
        console.log(`✅ Migration ${file} completed successfully`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Migration ${file} already applied, skipping...`);
        } else {
          console.error(`❌ Error running migration ${file}:`, error.message);
          throw error;
        }
      }
    }

    console.log('✅ All new migrations completed successfully');
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
  runNewMigrations();
}

module.exports = { runNewMigrations };
