const { pool } = require('./index');

async function addPinnedColumn() {
  try {
    await pool.query("ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;");
    console.log('Pinned column added to dm_messages (if it did not exist).');
  } catch (err) {
    console.error('Failed to add pinned column:', err.message);
  } finally {
    await pool.end();
  }
}

addPinnedColumn(); 