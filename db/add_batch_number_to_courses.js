const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '1234',
    database: process.env.PG_DATABASE || 'postgres',
});

async function addBatchNumberToCourses() {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Adding batch_number column to user_courses table...');

        // Check if column already exists
        const columnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_courses' AND column_name = 'batch_number'
        `);

        if (columnExists.rows.length > 0) {
            console.log('✅ batch_number column already exists');
            return;
        }

        // Add batch_number column
        await client.query(`
            ALTER TABLE user_courses 
            ADD COLUMN batch_number INTEGER DEFAULT 1
        `);

        console.log('✅ Successfully added batch_number column to user_courses table');

        // Update existing courses to have batch_number = 1
        const updateResult = await client.query(`
            UPDATE user_courses 
            SET batch_number = 1 
            WHERE batch_number IS NULL
        `);

        console.log(`✅ Updated ${updateResult.rowCount} existing courses with batch_number = 1`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// Run the migration
addBatchNumberToCourses()
    .then(() => {
        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    }); 