// Database initialization script
// Usage: node db/init_database.js

const { pool, testConnection, initTables, migrateUsersTable } = require('./index.js');

(async () => {
  try {
    console.log('🔄 Starting database initialization...');
    
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Database connection failed. Please check your database configuration.');
      process.exit(1);
    }
    
    // Initialize all tables
    await initTables();
    console.log('✅ Database tables initialized successfully');
    
    // Run user table migration
    await migrateUsersTable();
    console.log('✅ User table migration completed');
    
    console.log('🎉 Database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})(); 