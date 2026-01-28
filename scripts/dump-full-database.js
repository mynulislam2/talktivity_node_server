#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.PG_HOST || 'dpg-d24r71ali9vc73ejleog-a.singapore-postgres.render.com',
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
  user: process.env.PG_USER || 'talktivity',
  password: process.env.PG_PASSWORD || 'b1WtQV8bwYA8k0i32iKdvFzD3ZEzNTjz',
  database: process.env.PG_DATABASE || 'talktivity_postgres_sql_33av',
  ssl: { rejectUnauthorized: false },
  connect_timeout: 15000,
});

async function dumpDatabase() {
  let client;
  try {
    console.log('🔄 Connecting to database...');
    client = await pool.connect();
    console.log('✅ Connected!\n');

    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log('📋 Found', tables.length, 'tables');

    let dump = '-- PostgreSQL Database Dump\n';
    dump += '-- Generated: ' + new Date().toISOString() + '\n';
    dump += '-- Database: ' + (process.env.PG_DATABASE || 'talktivity_postgres_sql_33av') + '\n\n';

    let totalRecords = 0;

    for (const tableName of tables) {
      console.log('  📥 Dumping', tableName);

      const struct = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const data = await client.query(`SELECT * FROM "${tableName}"`);
      totalRecords += data.rows.length;

      dump += `-- ============================================\n`;
      dump += `-- Table: ${tableName}\n`;
      dump += `-- Records: ${data.rows.length}\n`;
      dump += `-- ============================================\n`;
      dump += `-- Columns:\n`;
      struct.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL';
        const def = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        dump += `--   ${col.column_name.padEnd(26)} ${col.data_type.padEnd(20)} ${nullable}${def}\n`;
      });
      dump += '\n';

      if (data.rows.length > 0) {
        dump += `-- Data:\n`;
        dump += JSON.stringify(data.rows, null, 2);
      } else {
        dump += '-- Data: (empty)';
      }
      dump += '\n\n';
    }

    const filename = path.join(__dirname, `..`, `database_dump_${new Date().toISOString().split('T')[0]}.sql`);
    fs.writeFileSync(filename, dump, 'utf8');

    const sizeMB = (dump.length / 1024 / 1024).toFixed(2);
    console.log('\n✅ Database dumped');
    console.log('📄 File:', filename);
    console.log('📊 Size:', sizeMB, 'MB');
    console.log('📊 Tables:', tables.length);
    console.log('📊 Total records:', totalRecords);
  } catch (err) {
    console.error('❌ Dump failed:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

dumpDatabase();
