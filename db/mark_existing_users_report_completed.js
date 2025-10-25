// Script to mark existing users as report completed
// Usage: node db/mark_existing_users_report_completed.js

const { pool, testConnection } = require('./index.js');

(async () => {
  try {
    console.log('🔄 Starting to mark existing users as report completed...');
    
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Database connection failed. Please check your database configuration.');
      process.exit(1);
    }
    
    // Update all existing users to mark them as report completed
    const result = await pool.query(
      'UPDATE users SET report_completed = true, updated_at = NOW() WHERE report_completed = false RETURNING id'
    );
    
    console.log(`✅ Marked ${result.rowCount} existing users as report completed`);
    console.log('🎉 Database update completed successfully!');
    
  } catch (error) {
    console.error('❌ Database update failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();