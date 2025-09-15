// src/server.js
// Server bootstrap (listen, signals)

require('dotenv').config();

// Import configuration
const { config, validateEnvironmentVariables } = require('./config');

// Import database module
const db = require('./core/db/client');

// Import Express app
const app = require('./app');

// Import Socket.IO setup
const { setupSocketIO } = require('./core/socket');

// Create HTTP server and wrap Express app
const http = require('http');
const server = http.createServer(app);

// Setup Socket.IO
const io = setupSocketIO(server);

// Start the server
const startServer = async () => {
  try {
    // Validate environment variables first
    console.log('🔍 Validating environment variables...');
    validateEnvironmentVariables();
    
    // Test database connection first
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      process.exit(1);
    }
    
    // Start the server (now using HTTP server for Socket.IO)
    server.listen(config.port, () => {
      console.log(`Server running on http://localhost:${config.port}`);
      console.log(`WebSocket server ready on ws://localhost:${config.port}`);
      console.log(`
Available routes:
  Authentication:
  - POST   /api/auth/register
  - POST   /api/auth/login
  - GET    /api/auth/profile (requires authentication)
  - PUT    /api/auth/profile (requires authentication)
  - PUT    /api/auth/change-password (requires authentication)
        
  Groups:
  - GET    /api/groups
  - POST   /api/groups/create
  - POST   /api/groups/:groupId/join
  - POST   /api/groups/:groupId/leave
  - GET    /api/groups/:groupId/members
  - GET    /api/groups/joined
  - DELETE /api/groups/:groupId
        
  Transcripts:
  - POST   /api/transcripts
  - GET    /api/transcripts/users/:userId/latest-conversations
  - GET    /api/transcripts/users/:userId/experience
        
  Other:
  - GET    /health
      `);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Handle termination signals
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await db.gracefulShutdown();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await db.gracefulShutdown();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Start the server
startServer();

module.exports = { app, server, io };