require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '1234',
    database: process.env.PG_DATABASE || 'postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

async function wipeAllData() {
    let client;
    try {
        client = await pool.connect();
        console.log('🧹 Starting complete database wipe...');

        // First, let's see what data exists
        const tables = [
            'users',
            'conversations', 
            'device_conversations',
            'onboarding_data',
            'user_sessions',
            'user_oauth_providers',
            'user_courses',
            'daily_progress',
            'weekly_exams',
            'speaking_sessions'
        ];

        console.log('\n📊 Current data count:');
        for (const table of tables) {
            try {
                const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
                const count = parseInt(result.rows[0].count);
                console.log(`  - ${table}: ${count} records`);
            } catch (error) {
                console.log(`  - ${table}: Table not found or error`);
            }
        }

        // Ask for confirmation
        console.log('\n⚠️  WARNING: This will DELETE ALL DATA from all tables!');
        console.log('This action cannot be undone.');
        
        // For safety, we'll require manual confirmation
        console.log('\nTo proceed with the wipe, please run this command with the --confirm flag:');
        console.log('node db/wipe_all_data.js --confirm');
        
        if (process.argv.includes('--confirm')) {
            console.log('\n🔄 Proceeding with data wipe...');
            
            // Disable foreign key checks temporarily
            await client.query('SET session_replication_role = replica;');
            
            // Delete all data from all tables
            for (const table of tables) {
                try {
                    const result = await client.query(`DELETE FROM ${table}`);
                    console.log(`✅ Deleted ${result.rowCount} records from ${table}`);
                } catch (error) {
                    console.log(`⚠️  Could not delete from ${table}: ${error.message}`);
                }
            }
            
            // Re-enable foreign key checks
            await client.query('SET session_replication_role = DEFAULT;');
            
            console.log('\n🎉 Database wipe completed successfully!');
            console.log('All data has been removed from all tables.');
            
        } else {
            console.log('\n❌ Wipe cancelled. No data was deleted.');
            console.log('Run with --confirm flag to proceed.');
        }

    } catch (error) {
        console.error('❌ Error during database wipe:', error);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// Run the wipe
wipeAllData()
    .then(() => {
        console.log('\n✅ Database wipe process completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Database wipe failed:', error);
        process.exit(1);
    }); 