const { Pool } = require('pg');
require('dotenv').config();

// Validate required database environment variables
if (!process.env.PG_HOST || !process.env.PG_PORT || !process.env.PG_USER || !process.env.PG_PASSWORD || !process.env.PG_DATABASE) {
    throw new Error('Database configuration error: Missing required environment variables. Please set PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, and PG_DATABASE in your .env file.');
}

const pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE
});

async function migratePersonalizedTopics() {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Starting personalized topics migration...');

        // Check if column already exists
        const columnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_courses' AND column_name = 'personalized_topics'
        `);

        if (columnExists.rows.length > 0) {
            console.log('✅ personalized_topics column already exists');
            return;
        }

        // Add personalized_topics column
        await client.query(`
            ALTER TABLE user_courses 
            ADD COLUMN personalized_topics JSONB DEFAULT '[]'
        `);

        console.log('✅ Successfully added personalized_topics column to user_courses table');

        // Update existing courses to have empty personalized topics array
        const updateResult = await client.query(`
            UPDATE user_courses 
            SET personalized_topics = '[]'::jsonb 
            WHERE personalized_topics IS NULL
        `);

        console.log(`✅ Updated ${updateResult.rowCount} existing courses with empty personalized topics`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    migratePersonalizedTopics()
        .then(() => {
            console.log('✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { migratePersonalizedTopics }; 