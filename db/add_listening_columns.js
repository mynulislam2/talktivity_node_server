const { pool } = require('./index');

async function addListeningColumns() {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    console.log('Adding listening columns to daily_progress table...');

    // Check if columns already exist
    const columnsToAdd = [
      { name: 'listening_completed', type: 'BOOLEAN DEFAULT false' },
      { name: 'listening_start_time', type: 'TIMESTAMP' },
      { name: 'listening_end_time', type: 'TIMESTAMP' },
      { name: 'listening_duration_seconds', type: 'INTEGER DEFAULT 0' },
      { name: 'listening_quiz_completed', type: 'BOOLEAN DEFAULT false' },
      { name: 'listening_quiz_score', type: 'INTEGER' },
      { name: 'listening_quiz_attempts', type: 'INTEGER DEFAULT 0' }
    ];

    for (const column of columnsToAdd) {
      const columnExists = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'daily_progress' 
        AND column_name = $1
      `, [column.name]);

      if (columnExists.rows.length === 0) {
        await client.query(`ALTER TABLE daily_progress ADD COLUMN ${column.name} ${column.type}`);
        console.log(`✅ Added column: ${column.name}`);
      } else {
        console.log(`⏭️  Column already exists: ${column.name}`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Listening columns migration completed successfully');
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError.message);
      }
    }
    console.error('❌ Error adding listening columns:', error.message);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  addListeningColumns()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addListeningColumns }; 