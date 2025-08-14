require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE || 'postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrateRemoveDeviceIdDependency() {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Starting migration to remove device ID dependency...');

        // Step 1: Update onboarding_data table to use user_id instead of fingerprint_id
        console.log('📝 Step 1: Updating onboarding_data table...');
        
        // Add user_id column if it doesn't exist
        await client.query(`
            ALTER TABLE onboarding_data 
            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
        `);

        // Check if fingerprint_id column still exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'onboarding_data' 
            AND column_name = 'fingerprint_id'
        `);

        if (columnCheck.rows.length > 0) {
            console.log('📝 fingerprint_id column found, migrating data...');
            
            // Migrate existing data from fingerprint_id to user_id
            await client.query(`
                UPDATE onboarding_data 
                SET user_id = users.id 
                FROM users 
                WHERE onboarding_data.fingerprint_id = users.fingerprint_id 
                AND onboarding_data.user_id IS NULL
            `);

            // Check if there are any orphaned records (onboarding data without corresponding users)
            const orphanedResult = await client.query(`
                SELECT COUNT(*) as count 
                FROM onboarding_data 
                WHERE user_id IS NULL
            `);
            
            const orphanedCount = parseInt(orphanedResult.rows[0].count);
            
            if (orphanedCount > 0) {
                console.log(`⚠️  Found ${orphanedCount} orphaned onboarding records without corresponding users.`);
                console.log('🗑️  Removing orphaned onboarding records...');
                
                // Delete orphaned onboarding records
                await client.query(`
                    DELETE FROM onboarding_data 
                    WHERE user_id IS NULL
                `);
                
                console.log(`✅ Removed ${orphanedCount} orphaned onboarding records.`);
            }

            // Now we can safely make user_id NOT NULL
            await client.query(`
                ALTER TABLE onboarding_data 
                ALTER COLUMN user_id SET NOT NULL
            `);

            await client.query(`
                ALTER TABLE onboarding_data 
                DROP COLUMN IF EXISTS fingerprint_id
            `);

            // Update index
            await client.query(`
                DROP INDEX IF EXISTS idx_onboarding_fingerprint
            `);
        } else {
            console.log('📝 fingerprint_id column already removed, checking user_id status...');
            
            // Check if user_id is already NOT NULL
            const userIdCheck = await client.query(`
                SELECT is_nullable 
                FROM information_schema.columns 
                WHERE table_name = 'onboarding_data' 
                AND column_name = 'user_id'
            `);
            
            if (userIdCheck.rows.length > 0 && userIdCheck.rows[0].is_nullable === 'YES') {
                console.log('📝 Making user_id NOT NULL...');
                await client.query(`
                    ALTER TABLE onboarding_data 
                    ALTER COLUMN user_id SET NOT NULL
                `);
            }
        }

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_onboarding_user_id ON onboarding_data(user_id)
        `);

        console.log('✅ Step 1 completed: onboarding_data table updated');

        // Step 2: Remove fingerprint_id from users table
        console.log('📝 Step 2: Removing fingerprint_id from users table...');
        
        // Check if fingerprint_id column exists in users table
        const usersFingerprintCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'fingerprint_id'
        `);

        if (usersFingerprintCheck.rows.length > 0) {
            await client.query(`
                ALTER TABLE users 
                DROP COLUMN IF EXISTS fingerprint_id
            `);

            await client.query(`
                DROP INDEX IF EXISTS idx_users_fingerprint_id
            `);
            console.log('✅ fingerprint_id removed from users table');
        } else {
            console.log('✅ fingerprint_id already removed from users table');
        }

        console.log('✅ Step 2 completed: fingerprint_id removed from users table');

        // Step 3: Remove user_devices table
        console.log('📝 Step 3: Removing user_devices table...');
        
        // Check if user_devices table exists
        const userDevicesCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'user_devices'
        `);

        if (userDevicesCheck.rows.length > 0) {
            await client.query(`
                DROP TABLE IF EXISTS user_devices CASCADE
            `);
            console.log('✅ user_devices table removed');
        } else {
            console.log('✅ user_devices table already removed');
        }

        console.log('✅ Step 3 completed: user_devices table removed');

        // Step 4: Update device_conversations to use user_id
        console.log('📝 Step 4: Updating device_conversations table...');
        
        // Check if device_conversations table exists
        const deviceConversationsCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'device_conversations'
        `);

        if (deviceConversationsCheck.rows.length > 0) {
            // Add user_id column if it doesn't exist
            await client.query(`
                ALTER TABLE device_conversations 
                ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            `);

            // Create index for user_id
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_device_conversations_user_id ON device_conversations(user_id)
            `);
            console.log('✅ device_conversations table updated');
        } else {
            console.log('✅ device_conversations table does not exist, skipping');
        }

        console.log('✅ Step 4 completed: device_conversations table updated');

        // Step 5: Update device_speaking_sessions to use user_id
        console.log('📝 Step 5: Updating device_speaking_sessions table...');
        
        // Check if device_speaking_sessions table exists
        const deviceSpeakingSessionsCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'device_speaking_sessions'
        `);

        if (deviceSpeakingSessionsCheck.rows.length > 0) {
            // Add user_id column if it doesn't exist
            await client.query(`
                ALTER TABLE device_speaking_sessions 
                ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
            `);

            // Create index for user_id
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_device_speaking_sessions_user_id ON device_speaking_sessions(user_id)
            `);
            console.log('✅ device_speaking_sessions table updated');
        } else {
            console.log('✅ device_speaking_sessions table does not exist, skipping');
        }

        console.log('✅ Step 5 completed: device_speaking_sessions table updated');

        console.log('🎉 Migration completed successfully!');
        console.log('✅ Device ID dependency has been removed from the database schema.');

    } catch (error) {
        console.error('❌ Error during migration:', error);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// Run the migration
migrateRemoveDeviceIdDependency()
    .then(() => {
        console.log('\n✅ Migration process completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    });
