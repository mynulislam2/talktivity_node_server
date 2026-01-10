// db/index.js
const { Pool } = require('pg');
require('dotenv').config();

// Validate required database environment variables
const requiredEnvVars = {
    PG_HOST: process.env.PG_HOST,
    PG_PORT: process.env.PG_PORT,
    PG_USER: process.env.PG_USER,
    PG_PASSWORD: process.env.PG_PASSWORD,
    PG_DATABASE: process.env.PG_DATABASE
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    throw new Error(`Database configuration error: Missing required environment variables: ${missingVars.join(', ')}. Please set these variables in your .env file.`);
}

// Validate database credentials are not using default/weak values
if (process.env.PG_PASSWORD === '1234' || process.env.PG_PASSWORD === 'password' || process.env.PG_PASSWORD === 'admin') {
    throw new Error('Database security error: PG_PASSWORD cannot be a default/weak value. Please use a strong, secure password.');
}

console.log('✅ Database environment variables validated successfully');

// Create a PostgreSQL connection pool
const pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    // Optimized pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection to become available
    ssl:{
        rejectUnauthorized: false // Disable SSL verification for development
    }
});

// Handle pool errors globally
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    // Do not exit process on connection errors
});

// Test database connection
const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ Database connected successfully at:', result.rows[0].now);
        return true;
    } catch (err) {
        return false;
    } finally {
        if (client) client.release();
    }
};

// Check if column exists in table
const columnExists = async (client, tableName, columnName) => {
    try {
        const result = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
        `, [tableName, columnName]);
        return result.rows.length > 0;
    } catch (error) {
        console.error(`Error checking if column ${columnName} exists in ${tableName}:`, error.message);
        return false;
    }
};

// Check if index exists
const indexExists = async (client, indexName) => {
    try {
        const result = await client.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE indexname = $1
        `, [indexName]);
        return result.rows.length > 0;
    } catch (error) {
        console.error(`Error checking if index ${indexName} exists:`, error.message);
        return false;
    }
};


// Initialize database functions
const initFunctions = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Initializing database functions...');

        await client.query(`
            CREATE OR REPLACE FUNCTION calculate_user_xp(
                speaking_seconds INT,
                full_sessions INT,
                quizzes INT,
                exams INT,
                streak INT
            ) RETURNS INT AS $$
            BEGIN
                RETURN (FLOOR(speaking_seconds / 60) * 2) + 
                       (full_sessions * 10) + 
                       (quizzes * 15) + 
                       (exams * 50) + 
                       (streak * 5);
            END;
            $$ LANGUAGE plpgsql;
        `);

        console.log('✅ Database functions initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing database functions:', error.message);
        return false;
    } finally {
        if (client) client.release();
    }
};

// Initialize database tables
const initTables = async () => {
    let client;
    let retryCount = 0;
    const maxRetries = 3;
    
    // Initialize functions first
    await initFunctions();
    
    while (retryCount < maxRetries) {
        try {
            client = await pool.connect();
            console.log('🔄 Initializing database tables... (attempt ' + (retryCount + 1) + ')');

            // Use transactions for table creation to ensure atomicity
            await client.query('BEGIN');

        // Updated Users table with Google OAuth support
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255), -- Nullable for Google OAuth users
                full_name VARCHAR(255),
                google_id VARCHAR(255) UNIQUE, -- Google user ID
                profile_picture TEXT, -- URL to profile picture
                auth_provider VARCHAR(50) DEFAULT 'local', -- 'local', 'google', etc.
                is_email_verified BOOLEAN DEFAULT false,
                is_admin BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indices for users table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
            CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
            CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
        `);

        // User devices table removed - all functionality now uses userId

        // Conversations table with indices
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                room_name VARCHAR(255) NOT NULL,
                participant_identity VARCHAR(255),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                transcript TEXT,
                user_id INTEGER NOT NULL,
                session_duration INTEGER DEFAULT NULL,
                agent_state VARCHAR(255) DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_room ON conversations(room_name);
            CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
            CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_session_duration ON conversations(session_duration) WHERE session_duration IS NOT NULL;
        `);

        // Onboarding data table
        await client.query(`
            CREATE TABLE IF NOT EXISTS onboarding_data (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                skill_to_improve VARCHAR(100),
                language_statement VARCHAR(10),
                industry VARCHAR(100),
                speaking_feelings VARCHAR(50),
                speaking_frequency VARCHAR(50),
                main_goal VARCHAR(100),
                gender VARCHAR(20),
                current_learning_methods JSONB DEFAULT '[]',
                current_level VARCHAR(50),
                native_language VARCHAR(100),
                known_words_1 JSONB DEFAULT '[]',
                known_words_2 JSONB DEFAULT '[]',
                interests JSONB DEFAULT '[]',
                english_style VARCHAR(50),
                tutor_style JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_onboarding_user_id ON onboarding_data(user_id);
        `);

        // Optional: Create a sessions table for better session management
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                refresh_token VARCHAR(255),
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
        `);

        // Optional: Create a table for storing OAuth provider information
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_oauth_providers (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                provider VARCHAR(50) NOT NULL, -- 'google', 'facebook', etc.
                provider_user_id VARCHAR(255) NOT NULL, -- ID from the OAuth provider
                access_token TEXT,
                refresh_token TEXT,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(provider, provider_user_id)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON user_oauth_providers(user_id);
            CREATE INDEX IF NOT EXISTS idx_oauth_provider ON user_oauth_providers(provider);
            CREATE INDEX IF NOT EXISTS idx_oauth_provider_user_id ON user_oauth_providers(provider_user_id);
        `);

        // Course management tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_courses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_start_date DATE NOT NULL,
                course_end_date DATE NOT NULL,
                current_week INTEGER DEFAULT 1,
                current_day INTEGER DEFAULT 1,
                is_active BOOLEAN DEFAULT true,
                personalized_topics JSONB DEFAULT '[]',
                batch_number INTEGER DEFAULT 1,
                batch_status JSONB DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_user_courses_user_id ON user_courses(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_courses_active ON user_courses(is_active);
        `);

        // Daily progress tracking
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_progress (
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
                listening_completed BOOLEAN DEFAULT false,
                listening_start_time TIMESTAMP,
                listening_end_time TIMESTAMP,
                listening_duration_seconds INTEGER DEFAULT 0,
                listening_quiz_completed BOOLEAN DEFAULT false,
                listening_quiz_score INTEGER,
                listening_quiz_attempts INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES user_courses(id) ON DELETE CASCADE,
                UNIQUE(user_id, date)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date ON daily_progress(user_id, date);
            CREATE INDEX IF NOT EXISTS idx_daily_progress_course ON daily_progress(course_id);
            CREATE INDEX IF NOT EXISTS idx_daily_progress_week_day ON daily_progress(week_number, day_number);
        `);

        // Weekly exam results
        await client.query(`
            CREATE TABLE IF NOT EXISTS weekly_exams (
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
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_weekly_exams_user_week ON weekly_exams(user_id, week_number);
            CREATE INDEX IF NOT EXISTS idx_weekly_exams_course ON weekly_exams(course_id);
        `);

        // Speaking sessions table for tracking multiple calls per day
        await client.query(`
            CREATE TABLE IF NOT EXISTS speaking_sessions (
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
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_speaking_sessions_user_date ON speaking_sessions(user_id, date);
        `);

        // Groups table for chat functionality
        await client.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                is_common BOOLEAN DEFAULT false,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_groups_common ON groups(is_common);
            CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
        `);

        // Group members table
        await client.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                id SERIAL PRIMARY KEY,
                group_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(group_id, user_id)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
            CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
        `);

        // Group messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS group_messages (
                id SERIAL PRIMARY KEY,
                group_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                pinned BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id);
            CREATE INDEX IF NOT EXISTS idx_group_messages_user_id ON group_messages(user_id);
            CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON group_messages(created_at);
        `);

        // DM (Direct Messages) table
        await client.query(`
            CREATE TABLE IF NOT EXISTS dms (
                id SERIAL PRIMARY KEY,
                user1_id INTEGER NOT NULL,
                user2_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user1_id, user2_id)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_dms_user1_id ON dms(user1_id);
            CREATE INDEX IF NOT EXISTS idx_dms_user2_id ON dms(user2_id);
        `);

        // DM messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS dm_messages (
                id SERIAL PRIMARY KEY,
                dm_id INTEGER NOT NULL,
                sender_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                pinned BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (dm_id) REFERENCES dms(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_dm_messages_dm_id ON dm_messages(dm_id);
            CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_id ON dm_messages(sender_id);
            CREATE INDEX IF NOT EXISTS idx_dm_messages_created_at ON dm_messages(created_at);
        `);

        // Last read tracking table
        await client.query(`
            CREATE TABLE IF NOT EXISTS last_read_at (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                group_id INTEGER,
                dm_id INTEGER,
                last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (dm_id) REFERENCES dms(id) ON DELETE CASCADE,
                UNIQUE(user_id, group_id, dm_id)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_last_read_user_id ON last_read_at(user_id);
            CREATE INDEX IF NOT EXISTS idx_last_read_group_id ON last_read_at(group_id);
            CREATE INDEX IF NOT EXISTS idx_last_read_dm_id ON last_read_at(dm_id);
        `);

        // Create default common group if it doesn't exist
        await client.query(`
            INSERT INTO groups (name, description, is_common) 
            VALUES ('Common Group', 'Default group for all users', true)
            ON CONFLICT DO NOTHING
        `);
        
        // Daily reports table
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                report_date DATE NOT NULL,
                report_data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, report_date)
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, report_date);
            CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
        `);

        // Topic categories table
        await client.query(`
            CREATE TABLE IF NOT EXISTS topic_categories (
                id SERIAL PRIMARY KEY,
                category_name VARCHAR(255) UNIQUE NOT NULL,
                topics JSONB NOT NULL DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_topic_categories_name ON topic_categories(category_name);
        `);
        
        // Small delay to prevent deadlocks
        await new Promise(resolve => setTimeout(resolve, 100));

            await client.query('COMMIT');
            
            // Note: Admin users are now created via secure token-based registration
            // Use /api/auth/admin-register endpoint with ADMIN_SETUP_TOKEN
            
            console.log('✅ Database tables initialized successfully');
            return true;
            
        } catch (error) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Error during rollback:', rollbackError.message);
                }
            }
            
            // Check if it's a deadlock error
            if (error.code === '40P01' || error.message.includes('deadlock')) {
                retryCount++;
                console.warn(`⚠️  Deadlock detected, retrying... (${retryCount}/${maxRetries})`);
                
                if (client) {
                    client.release();
                    client = null;
                }
                
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
            }
            
            // For other errors, don't retry
            console.error('❌ Error initializing database tables:', error.message);
            console.error('Error details:', error.stack);
            return false;
        } finally {
            if (client) client.release();
        }
    }
    
    // If we get here, all retries failed
    console.error('❌ Failed to initialize database tables after', maxRetries, 'attempts');
    return false;
};


// Clean up expired sessions (utility function)
const cleanupExpiredSessions = async () => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'DELETE FROM user_sessions WHERE expires_at < NOW()'
        );
        console.log(`🧹 Cleaned up ${result.rowCount} expired sessions`);
        return result.rowCount;
    } catch (error) {
        console.error('❌ Error cleaning up expired sessions:', error.message);
        return 0;
    } finally {
        if (client) client.release();
    }
};

// Get database statistics
const getDatabaseStats = async () => {
    let client;
    try {
        client = await pool.connect();
        
        const tables = ['users', 'conversations', 'onboarding_data', 'user_sessions', 'user_oauth_providers'];
        const stats = {};
        
        for (const table of tables) {
            try {
                const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
                stats[table] = parseInt(result.rows[0].count);
            } catch (error) {
                stats[table] = 'Table not found';
            }
        }
        
        return stats;
    } catch (error) {
        console.error('❌ Error getting database stats:', error.message);
        return null;
    } finally {
        if (client) client.release();
    }
};

// Graceful shutdown function
const gracefulShutdown = async () => {
    try {
        console.log('🔄 Closing database connections...');
        await pool.end();
        console.log('✅ Database pool has ended');
        return true;
    } catch (err) {
        return false;
    }
};

const migrateUsersTable = async () => {
  let client;
  try {
    client = await pool.connect();
    
    // Add new columns if they don't exist
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS profile_picture TEXT,
      ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'local',
      ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS report_completed BOOLEAN DEFAULT FALSE;
    `);
    
    // Create indices for new columns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
      CREATE INDEX IF NOT EXISTS idx_users_report_completed ON users(report_completed);
    `);
    
    // Make password nullable for existing table
    await client.query(`
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
    `);
    
    console.log('✅ Users table migration completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error migrating users table:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
};

// Daily Reports Functions
const getDailyReport = async (userId, reportDate) => {
  let client;
  try {
    client = await pool.connect();
    
    const result = await client.query(`
      SELECT report_data, created_at, updated_at
      FROM daily_reports 
      WHERE user_id = $1 AND report_date = $2
    `, [userId, reportDate]);
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error getting daily report:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
};

const saveDailyReport = async (userId, reportDate, reportData) => {
  let client;
  try {
    client = await pool.connect();
    
    const result = await client.query(`
      INSERT INTO daily_reports (user_id, report_date, report_data)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, report_date) 
      DO UPDATE SET 
        report_data = $3,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, created_at, updated_at
    `, [userId, reportDate, reportData]);
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error saving daily report:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
};

const deleteDailyReport = async (userId, reportDate) => {
  let client;
  try {
    client = await pool.connect();
    
    const result = await client.query(`
      DELETE FROM daily_reports 
      WHERE user_id = $1 AND report_date = $2
      RETURNING id
    `, [userId, reportDate]);
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error deleting daily report:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
};


// Setup periodic cleanup of expired sessions (run every hour)
const startPeriodicCleanup = () => {
    // Clean up expired sessions every hour
    setInterval(async () => {
        await cleanupExpiredSessions();
    }, 60 * 60 * 1000); // 1 hour in milliseconds
    
    console.log('🔄 Periodic session cleanup started (runs every hour)');
};

module.exports = {
    pool,
    testConnection,
    initTables,
    cleanupExpiredSessions,
    getDatabaseStats,
    migrateUsersTable,
    getDailyReport,
    saveDailyReport,
    deleteDailyReport,
    startPeriodicCleanup,
    gracefulShutdown
};