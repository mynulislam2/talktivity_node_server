/*
 Extract full database schema and generate Mermaid ER diagram
*/

const { pool } = require('./index');

async function dumpSchema() {
  const client = await pool.connect();
  try {
    console.log('📊 Extracting database schema...\n');

    // Get all tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables:\n${tables.join(', ')}\n`);

    const schema = {};
    const foreignKeys = [];

    // For each table, get columns and constraints
    for (const table of tables) {
      // Get columns
      const columnsResult = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      schema[table] = {
        columns: columnsResult.rows.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          default: col.column_default,
          maxLength: col.character_maximum_length
        }))
      };

      // Get foreign keys
      const fkResult = await client.query(`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
      `, [table]);

      for (const fk of fkResult.rows) {
        foreignKeys.push({
          from: table,
          fromColumn: fk.column_name,
          to: fk.foreign_table_name,
          toColumn: fk.foreign_column_name
        });
      }
    }

    // Generate Mermaid ER diagram
    console.log('\n=== MERMAID ER DIAGRAM ===\n');
    console.log('```mermaid');
    console.log('erDiagram');
    console.log('');

    // Add relationships
    const relationshipMap = {};
    for (const fk of foreignKeys) {
      const key = `${fk.from}_${fk.to}`;
      if (!relationshipMap[key]) {
        // Determine cardinality (simplified: assuming ||--o{)
        console.log(`    ${fk.to.toUpperCase()} ||--o{ ${fk.from.toUpperCase()} : "has"`);
        relationshipMap[key] = true;
      }
    }

    console.log('');

    // Add table definitions
    for (const [tableName, tableData] of Object.entries(schema)) {
      console.log(`    ${tableName.toUpperCase()} {`);
      for (const col of tableData.columns) {
        const typeMap = {
          'integer': 'int',
          'bigint': 'bigint',
          'character varying': 'string',
          'text': 'text',
          'boolean': 'boolean',
          'timestamp without time zone': 'timestamp',
          'timestamp with time zone': 'timestamptz',
          'date': 'date',
          'numeric': 'decimal',
          'double precision': 'float',
          'jsonb': 'jsonb',
          'json': 'json'
        };
        const mermaidType = typeMap[col.type] || col.type;
        console.log(`        ${mermaidType} ${col.name}`);
      }
      console.log(`    }`);
      console.log('');
    }

    console.log('```');
    console.log('\n=== SCHEMA DUMP ===\n');
    console.log(JSON.stringify(schema, null, 2));
    console.log('\n=== FOREIGN KEYS ===\n');
    console.log(JSON.stringify(foreignKeys, null, 2));

  } catch (err) {
    console.error('❌ Error:', err);
    process.exitCode = 1;
  } finally {
    try { client.release(); } catch {}
  }
}

dumpSchema();
