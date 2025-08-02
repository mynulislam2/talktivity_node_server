const { pool } = require('./index');
const fs = require('fs');
const path = require('path');

const createDailyReportsTable = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Creating daily_reports table...');

        // Read the SQL migration file
        const sqlPath = path.join(__dirname, 'migrations', '006_create_daily_reports.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // Execute the migration
        await client.query(sqlContent);
        
        console.log('✅ daily_reports table created successfully!');
        
        // Verify the table was created
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'daily_reports'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Table verification successful');
        } else {
            console.log('❌ Table verification failed');
        }

    } catch (error) {
        console.error('❌ Error creating daily_reports table:', error.message);
        throw error;
    } finally {
        if (client) client.release();
    }
};

// Run the migration if this file is executed directly
if (require.main === module) {
    createDailyReportsTable()
        .then(() => {
            console.log('🎉 Migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { createDailyReportsTable }; 