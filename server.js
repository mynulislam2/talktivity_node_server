// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const onboardingRoutes = require('./routes/onboarding-routes');
const googleRoutes = require('./routes/google_auth');

// Import database module (with pool and DB functions)
const db = require('./db');

// Import routes (AFTER db module is imported)
const authRoutes = require('./routes/auth-routes');
const transcriptRoutes = require('./routes/transcript-routes');

// Create Express app
const app = express();
const port = process.env.API_PORT || 8081;

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit payload size
// app.use(cors({
//   origin: process.env.CORS_ORIGIN || '*', // Restrict CORS if needed
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization']
  
// }));
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // ✅ Only if you use cookies or auth headers
}));
// Request logging middleware (simple)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint with DB connection status
app.get('/health', async (req, res) => {
  const dbConnected = await db.testConnection();
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is up and running',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// Mount route modules
app.use('/api/auth', googleRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', transcriptRoutes);
app.use('/api', onboardingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Create a .env file example
const generateEnvFile = () => `# Server Configuration
API_PORT=8081
CORS_ORIGIN=http://localhost:3000

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5433
PG_USER=postgres
PG_PASSWORD=1234
PG_DATABASE=postgres

# JWT Configuration
JWT_SECRET=your-secure-jwt-secret-key
JWT_EXPIRE=24h
`;

// Handle termination signals
process.on('SIGTERM', db.gracefulShutdown);
process.on('SIGINT', db.gracefulShutdown);

// Start the server
const startServer = async () => {
  try {
    // Test database connection first
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      console.error('Could not connect to database. Check your database configuration.');
      process.exit(1);
    }
    
    // Initialize tables
    const tablesInitialized = await db.initTables();
    const migrateUsersTable = await db.migrateUsersTable();
    if (!tablesInitialized) {
      console.error('Could not initialize database tables.');
      process.exit(1);
    }
    
    // Start the server
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
      console.log(`
Available routes:
  Authentication:
  - POST   /api/auth/register
  - POST   /api/auth/login
  - GET    /api/auth/profile (requires authentication)
  - PUT    /api/auth/profile (requires authentication)
  - PUT    /api/auth/change-password (requires authentication)
        
  Transcripts:
  - GET    /api/latest-transcript
  - GET    /api/latest-transcript/:room_name
  - GET    /api/transcripts
  - GET    /api/transcripts/:id
  - GET    /api/transcripts/room/:room_name
  - POST   /api/transcripts
  - DELETE /api/transcripts/:id
        
  Other:
  - GET    /health
      `);
      
      console.log('\nCreate a .env file with the following content to configure the server:');
      console.log(generateEnvFile());
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Start the server
startServer();