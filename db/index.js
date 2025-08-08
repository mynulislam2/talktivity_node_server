// db/index.js
const { Pool } = require('pg');
require('dotenv').config();

// Create a PostgreSQL connection pool
const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '1234',
    database: process.env.PG_DATABASE || 'postgres',
    // Optimized pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection to become available
    // ssl:{
    //     rejectUnauthorized: false // Disable SSL verification for development
    // }
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
        console.error('❌ Database connection error:', err.message);
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


// Initialize database tables
const initTables = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Initializing database tables...');

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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indices for users table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
            CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
        `);

        // User devices table for tracking all devices per user
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_devices (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                device_id VARCHAR(255) NOT NULL,
                last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, device_id)
            );
        `);

        // Conversations table with indices
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                room_name VARCHAR(255) NOT NULL,
                participant_identity VARCHAR(255),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                transcript TEXT,
                user_id INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_room ON conversations(room_name);
            CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
            CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
        `);

        // Onboarding data table
        await client.query(`
            CREATE TABLE IF NOT EXISTS onboarding_data (
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
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_onboarding_fingerprint ON onboarding_data(fingerprint_id);
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

        await client.query('COMMIT');
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
        console.error('❌ Error initializing database tables:', error.message);
        console.error('Error details:', error.stack);
        return false;
    } finally {
        if (client) client.release();
    }
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
        console.error('❌ Error closing database pool:', err.message);
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
      ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT false;
    `);
    
    // Create indices for new columns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
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