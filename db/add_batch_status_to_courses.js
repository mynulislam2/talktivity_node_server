const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '1234',
    database: process.env.PG_DATABASE || 'postgres',
    ssl: {
        rejectUnauthorized: false // Disable SSL verification for development
    }
});

async function addBatchStatusColumn() {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Adding batch_status column to user_courses table...');

        // Check if column already exists
        const columnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_courses' AND column_name = 'batch_status'
        `);

        if (columnExists.rows.length > 0) {
            console.log('✅ batch_status column already exists');
            return;
        }

        // Add the batch_status column
        await client.query(`
            ALTER TABLE user_courses 
            ADD COLUMN batch_status JSONB DEFAULT NULL
        `);

        console.log('✅ Successfully added batch_status column to user_courses table');

    } catch (error) {
        console.error('❌ Error adding batch_status column:', error);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// Run the migration
addBatchStatusColumn()
    .then(() => {
        console.log('🎉 Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    });
