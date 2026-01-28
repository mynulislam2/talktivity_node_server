#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.PG_HOST || 'dpg-d24r71ali9vc73ejleog-a.singapore-postgres.render.com',
  port: process.env.PG_PORT || 5432,
  user: process.env.PG_USER || 'talktivity',
  password: process.env.PG_PASSWORD || 'b1WtQV8bwYA8k0i32iKdvFzD3ZEzNTjz',
  database: process.env.PG_DATABASE || 'talktivity_postgres_sql_33av',
  ssl: { rejectUnauthorized: false },
  connect_timeout: 15000,
  idle_in_transaction_session_timeout: 15000
});

async function dumpDatabase() {
  let client;
  try {
    console.log('🔄 Connecting to database...');
    client = await pool.connect();
    console.log('✅ Connected!');
    
    console.log('📋 Fetching table list...');
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log('📋 Found', tables.length, 'tables');
    
    let dumpContent = '-- PostgreSQL Database Dump\n';
    dumpContent += '-- Generated: ' + new Date().toISOString() + '\n';
    dumpContent += '-- Database: talktivity_postgres_sql_33av\n';
    dumpContent += '-- Tables: ' + tables.join(', ') + '\n\n';
    
    let totalRecords = 0;
    
    // Dump each table
    for (const tableName of tables) {
      console.log(`  📥 ${tableName}...`);
      
      // Get table structure
      const structResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      // Get table data
      const dataResult = await client.query(`SELECT * FROM "${tableName}"`);
      totalRecords += dataResult.rows.length;
      
      dumpContent += `\n-- ============================================\n`;
      dumpContent += `-- Table: ${tableName}\n`;
      dumpContent += `-- Records: ${dataResult.rows.length}\n`;
      dumpContent += `-- ============================================\n\n`;
      
      // Add column definitions
      dumpContent += `-- Columns:\n`;
      structResult.rows.forEach(col => {
        dumpContent += `--   ${col.column_name}: ${col.data_type}\n`;
      });
      dumpContent += `\n`;
      
      // Add data as JSON
      if (dataResult.rows.length > 0) {
        dumpContent += `-- Data:\n`;
        dumpContent += JSON.stringify(dataResult.rows, null, 2);
      } else {
        dumpContent += `-- (empty table)\n`;
      }
      dumpContent += `\n\n`;
    }
    
    // Write to file
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = path.join(__dirname, '..', `database_dump_${timestamp}.sql`);
    fs.writeFileSync(filename, dumpContent, 'utf8');
    
    const sizeKB = (dumpContent.length / 1024).toFixed(2);
    console.log(`\n✅ Database dumped successfully!`);
    console.log(`📄 File: ${filename}`);
    console.log(`📊 Size: ${sizeKB} KB`);
    console.log(`📊 Tables: ${tables.length}`);
    console.log(`📊 Total records: ${totalRecords}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

dumpDatabase().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
