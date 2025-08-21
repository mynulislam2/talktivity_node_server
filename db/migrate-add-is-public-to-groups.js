const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Validate required database environment variables
if (!process.env.PG_HOST || !process.env.PG_PORT || !process.env.PG_USER || !process.env.PG_PASSWORD || !process.env.PG_DATABASE) {
    throw new Error('Database configuration error: Missing required environment variables. Please set PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, and PG_DATABASE in your .env file.');
}

const pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE
});

(async () => {
    const client = await pool.connect();
    try {
        console.log('Running add is_public to groups migration...');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration faile');
    } finally {
        client.release();
        await pool.end();
    }
})(); 