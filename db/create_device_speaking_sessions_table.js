const { pool } = require('./index');
const fs = require('fs');
const path = require('path');

const createDeviceSpeakingSessionsTable = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Creating device_speaking_sessions table...');
        const sqlPath = path.join(__dirname, 'migrations', '007_create_device_speaking_sessions.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sqlContent);
        console.log('✅ device_speaking_sessions table created successfully!');
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'device_speaking_sessions'
        `);
        if (result.rows.length > 0) {
            console.log('✅ Table verification successful');
        } else {
            console.log('❌ Table verification failed');
        }
    } catch (error) {
        console.error('❌ Error creating device_speaking_sessions table:', error.message);
        throw error;
    } finally {
        if (client) client.release();
    }
};

if (require.main === module) {
    createDeviceSpeakingSessionsTable()
        .then(() => {
            console.log('🎉 Migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { createDeviceSpeakingSessionsTable }; 