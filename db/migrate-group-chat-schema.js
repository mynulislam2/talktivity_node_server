const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const sqlFilePath = path.join(__dirname, 'migrations', '001_create_group_chat_schema.sql');
const sql = fs.readFileSync(sqlFilePath, 'utf8');

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5433'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '1234',
    database: process.env.PG_DATABASE || 'postgres',

});

(async () => {
    const client = await pool.connect();
    try {
        console.log('Running group chat schema migration...');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
})(); 