// src/core/db/client.js
// Database client initialization

const { Pool } = require('pg');
const { config } = require('../../config');

// Validate required database environment variables
const requiredEnvVars = {
    PG_HOST: config.db.host,
    PG_PORT: config.db.port,
    PG_USER: config.db.user,
    PG_PASSWORD: config.db.password,
    PG_DATABASE: config.db.database
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    throw new Error(`Database configuration error: Missing required environment variables: ${missingVars.join(', ')}. Please set these variables in your .env file.`);
}

// Validate database credentials are not using default/weak values
if (config.db.password === '1234' || config.db.password === 'password' || config.db.password === 'admin') {
    throw new Error('Database security error: PG_PASSWORD cannot be a default/weak value. Please use a strong, secure password.');
}

console.log('✅ Database environment variables validated successfully');

// Create a PostgreSQL connection pool
const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    // Optimized pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection to become available
    ssl: {
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

module.exports = {
    pool,
    testConnection,
    gracefulShutdown
};