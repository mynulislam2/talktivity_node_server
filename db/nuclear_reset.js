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

async function nuclearReset() {
    let client;
    try {
        client = await pool.connect();
        console.log('☢️  Starting nuclear database reset...');

        // Show current tables
        console.log('\n📋 Current tables in database:');
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        
        tablesResult.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });

        console.log('\n⚠️  NUCLEAR WARNING: This will DROP ALL TABLES and recreate them!');
        console.log('This action cannot be undone and will completely reset your database.');
        
        if (!process.argv.includes('--nuclear-confirm')) {
            console.log('\nTo proceed with nuclear reset, run:');
            console.log('node db/nuclear_reset.js --nuclear-confirm');
            console.log('\n❌ Nuclear reset cancelled. No changes made.');
            return;
        }

        console.log('\n🔄 Proceeding with nuclear reset...');

        // Dynamically drop all tables in the public schema
        const dynamicDropTables = async () => {
            const tables = await client.query(`
                SELECT tablename FROM pg_tables WHERE schemaname = 'public'
            `);
            for (const row of tables.rows) {
                try {
                    await client.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
                    console.log(`✅ Dropped table: ${row.tablename}`);
                } catch (error) {
                    console.log(`⚠️  Error dropping table ${row.tablename}: ${error.message}`);
                }
            }
        };
        await dynamicDropTables();

        // Remove all large objects (BLOBs)
        try {
            await client.query('SELECT lo_unlink(oid) FROM pg_largeobject_metadata');
            console.log('✅ Removed all large objects');
        } catch (error) {
            console.log(`⚠️  Error removing large objects: ${error.message}`);
        }

        // Reclaim disk space
        try {
            await client.query('VACUUM FULL');
            console.log('✅ VACUUM FULL completed, disk space reclaimed');
        } catch (error) {
            console.log(`⚠️  Error running VACUUM FULL: ${error.message}`);
        }

        // Recreate all tables
        console.log('\n🏗️  Recreating all tables...');
        
        // Users table
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255),
                full_name VARCHAR(255),
                google_id VARCHAR(255) UNIQUE,
                profile_picture TEXT,
                auth_provider VARCHAR(50) DEFAULT 'local',
                is_email_verified BOOLEAN DEFAULT false,
                fingerprint_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created users table');

        // Conversations table
        await client.query(`
            CREATE TABLE conversations (
                id SERIAL PRIMARY KEY,
                room_name VARCHAR(255) NOT NULL,
                participant_identity VARCHAR(255),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                transcript TEXT,
                user_id INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created conversations table');

        // Device conversations table (for fingerprint-based conversations)
        await client.query(`
            CREATE TABLE device_conversations (
                id SERIAL PRIMARY KEY,
                room_name VARCHAR(255) NOT NULL,
                device_id VARCHAR(64) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                transcript JSONB NOT NULL
            )
        `);
        console.log('✅ Created device_conversations table');

        // Onboarding data table
        await client.query(`
            CREATE TABLE onboarding_data (
                id SERIAL PRIMARY KEY,
                fingerprint_id VARCHAR(255) UNIQUE NOT NULL,
                skill_to_improve VARCHAR(100),
                language_statement VARCHAR(10),
                english_usage JSONB DEFAULT '[]',
                industry VARCHAR(100),
                speaking_feelings VARCHAR(50),
                speaking_frequency VARCHAR(50),
                improvement_areas JSONB DEFAULT '[]',
                main_goal VARCHAR(100),
                speaking_obstacles JSONB DEFAULT '[]',
                gender VARCHAR(20),
                current_learning_methods JSONB DEFAULT '[]',
                learning_challenges JSONB DEFAULT '[]',
                hardest_part VARCHAR(100),
                current_level VARCHAR(50),
                native_language VARCHAR(100),
                known_words_1 JSONB DEFAULT '[]',
                known_words_2 JSONB DEFAULT '[]',
                work_scenarios JSONB DEFAULT '[]',
                upcoming_occasions JSONB DEFAULT '[]',
                interests JSONB DEFAULT '[]',
                english_style VARCHAR(50),
                tutor_style JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created onboarding_data table');

        // User sessions table
        await client.query(`
            CREATE TABLE user_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created user_sessions table');

        // User OAuth providers table
        await client.query(`
            CREATE TABLE user_oauth_providers (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                provider VARCHAR(50) NOT NULL,
                provider_user_id VARCHAR(255) NOT NULL,
                access_token TEXT,
                refresh_token TEXT,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(provider, provider_user_id)
            )
        `);
        console.log('✅ Created user_oauth_providers table');

        // User courses table
        await client.query(`
            CREATE TABLE user_courses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_start_date DATE NOT NULL,
                course_end_date DATE NOT NULL,
                current_week INTEGER DEFAULT 1,
                current_day INTEGER DEFAULT 1,
                is_active BOOLEAN DEFAULT true,
                personalized_topics JSONB DEFAULT '[]',
                batch_number INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created user_courses table');

        // Daily progress table
        await client.query(`
            CREATE TABLE daily_progress (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                week_number INTEGER NOT NULL,
                day_number INTEGER NOT NULL,
                date DATE NOT NULL,
                speaking_completed BOOLEAN DEFAULT false,
                speaking_start_time TIMESTAMP,
                speaking_end_time TIMESTAMP,
                speaking_duration_seconds INTEGER DEFAULT 0,
                quiz_completed BOOLEAN DEFAULT false,
                quiz_score INTEGER,
                quiz_attempts INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES user_courses(id) ON DELETE CASCADE,
                UNIQUE(user_id, date)
            )
        `);
        console.log('✅ Created daily_progress table');

        // Weekly exams table
        await client.query(`
            CREATE TABLE weekly_exams (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                week_number INTEGER NOT NULL,
                exam_date DATE NOT NULL,
                exam_completed BOOLEAN DEFAULT false,
                exam_score INTEGER,
                exam_duration_seconds INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES user_courses(id) ON DELETE CASCADE,
                UNIQUE(user_id, week_number)
            )
        `);
        console.log('✅ Created weekly_exams table');

        // Speaking sessions table
        await client.query(`
            CREATE TABLE speaking_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                date DATE NOT NULL,
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP,
                duration_seconds INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES user_courses(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created speaking_sessions table');

        // Create all indices
        console.log('\n📊 Creating indices...');
        const indexQueries = [
            'CREATE INDEX idx_users_email ON users(email)',
            'CREATE INDEX idx_users_google_id ON users(google_id)',
            'CREATE INDEX idx_users_auth_provider ON users(auth_provider)',
            'CREATE INDEX idx_users_fingerprint_id ON users(fingerprint_id)',
            'CREATE INDEX idx_conversations_room ON conversations(room_name)',
            'CREATE INDEX idx_conversations_timestamp ON conversations(timestamp)',
            'CREATE INDEX idx_conversations_user_id ON conversations(user_id)',
            'CREATE INDEX idx_device_conversations_room ON device_conversations(room_name)',
            'CREATE INDEX idx_device_conversations_timestamp ON device_conversations(timestamp)',
            'CREATE INDEX idx_device_conversations_device_id ON device_conversations(device_id)',
            'CREATE INDEX idx_onboarding_fingerprint ON onboarding_data(fingerprint_id)',
            'CREATE INDEX idx_user_sessions_token ON user_sessions(session_token)',
            'CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id)',
            'CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at)',
            'CREATE INDEX idx_oauth_user_id ON user_oauth_providers(user_id)',
            'CREATE INDEX idx_oauth_provider ON user_oauth_providers(provider)',
            'CREATE INDEX idx_oauth_provider_user_id ON user_oauth_providers(provider_user_id)',
            'CREATE INDEX idx_user_courses_user_id ON user_courses(user_id)',
            'CREATE INDEX idx_user_courses_active ON user_courses(is_active)',
            'CREATE INDEX idx_daily_progress_user_date ON daily_progress(user_id, date)',
            'CREATE INDEX idx_daily_progress_course ON daily_progress(course_id)',
            'CREATE INDEX idx_daily_progress_week_day ON daily_progress(week_number, day_number)',
            'CREATE INDEX idx_weekly_exams_user_week ON weekly_exams(user_id, week_number)',
            'CREATE INDEX idx_weekly_exams_course ON weekly_exams(course_id)',
            'CREATE INDEX idx_speaking_sessions_user_date ON speaking_sessions(user_id, date)'
        ];

        for (const query of indexQueries) {
            try {
                await client.query(query);
                console.log(`✅ Created index: ${query.split(' ')[2]}`);
            } catch (error) {
                console.log(`⚠️  Error creating index: ${error.message}`);
            }
        }

        console.log('\n🎉 Nuclear reset completed successfully!');
        console.log('All tables have been dropped and recreated from scratch.');
        console.log('Your database is now completely clean and ready for fresh data.');

    } catch (error) {
        console.error('❌ Error during nuclear reset:', error);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

// Run the nuclear reset
nuclearReset()
    .then(() => {
        console.log('\n✅ Nuclear reset process completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Nuclear reset failed:', error);
        process.exit(1);
    }); 