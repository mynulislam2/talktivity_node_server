/**
 * Server Bootstrap
 * Start Express server with graceful shutdown
 */

const app = require('./app');
const config = require('./config');
const db = require('./core/db/client');

const server = app.listen(config.PORT, async () => {
  console.log(`✅ Server running on http://localhost:${config.PORT}`);
  console.log(`📚 Environment: ${config.NODE_ENV}`);
  
  // Test database connection
  try {
    const result = await db.queryOne(`SELECT NOW() as time`);
    console.log(`✅ Database connected: ${result.time}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📌 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📌 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
});

// Unhandled errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = server;
