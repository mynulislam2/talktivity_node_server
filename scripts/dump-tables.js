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
  connect_timeout: 15000
});

async function dumpTables() {
  let client;
  try {
    console.log('🔄 Connecting to database...');
    client = await pool.connect();
    console.log('✅ Connected!\n');
    
    console.log('📋 Fetching table structure...');
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log('📋 Found', tables.length, 'tables\n');
    
    let dumpContent = '-- PostgreSQL Table Schema Dump\n';
    dumpContent += '-- Generated: ' + new Date().toISOString() + '\n';
    dumpContent += '-- Database: talktivity_postgres_sql_33av\n\n';
    
    // Dump each table structure
    for (const tableName of tables) {
      console.log(`  📥 ${tableName}`);
      
      const structResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      const recordCount = countResult.rows[0].count;
      
      dumpContent += `\n-- ============================================\n`;
      dumpContent += `-- Table: ${tableName}\n`;
      dumpContent += `-- Records: ${recordCount}\n`;
      dumpContent += `-- ============================================\n`;
      dumpContent += `-- Columns:\n`;
      
      structResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        dumpContent += `--   ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable}${defaultVal}\n`;
      });
      
      dumpContent += `\n`;
    }
    
    // Write to file
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = path.join(__dirname, '..', `tables_schema_${timestamp}.sql`);
    fs.writeFileSync(filename, dumpContent, 'utf8');
    
    const sizeKB = (dumpContent.length / 1024).toFixed(2);
    console.log(`\n✅ Table schema dumped!\n`);
    console.log(`📄 File: ${filename}`);
    console.log(`📊 Size: ${sizeKB} KB`);
    console.log(`📊 Tables: ${tables.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

dumpTables().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
