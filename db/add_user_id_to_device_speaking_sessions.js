const { pool } = require('./index');
const fs = require('fs');
const path = require('path');

const addUserIdToDeviceSpeakingSessions = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Adding user_id column to device_speaking_sessions table...');
        
        const sqlPath = path.join(__dirname, 'migrations', '008_add_user_id_to_device_speaking_sessions.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        // Split the SQL into individual statements
        const statements = sqlContent.split(';').filter(stmt => stmt.trim().length > 0);
        
        for (const statement of statements) {
            if (statement.trim()) {
                await client.query(statement);
            }
        }
        
        console.log('✅ user_id column added to device_speaking_sessions table successfully!');
        
        // Verify the column was added
        const result = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'device_speaking_sessions' 
            AND column_name = 'user_id'
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Column verification successful');
        } else {
            console.log('❌ Column verification failed');
        }
        
    } catch (error) {
        console.error('❌ Error adding user_id column:', error.message);
        throw error;
    } finally {
        if (client) client.release();
    }
};

if (require.main === module) {
    addUserIdToDeviceSpeakingSessions()
        .then(() => {
            console.log('🎉 Migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { addUserIdToDeviceSpeakingSessions };
