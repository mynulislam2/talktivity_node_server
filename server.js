// server.js
// NEW ARCHITECTURE: This is a wrapper that imports the modular app from src/app.js
// All route definitions, controllers, and services are now in src/modules/
require('dotenv').config();

const http = require('http');
const { initSocket } = require('./src/core/socket/socketService');
const db = require('./db');
const app = require('./src/app');

// Configuration
const port = process.env.API_PORT || 8082;

// Environment variable validation
const validateEnvironmentVariables = () => {
  const requiredVars = [
    'JWT_SECRET',
    'PG_HOST',
    'PG_PORT', 
    'PG_USER',
    'PG_PASSWORD',
    'PG_DATABASE',
    'ALLOWED_ORIGINS'
  ];

  const optionalVars = [
    'GROQ_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'ADMIN_SETUP_TOKEN',
    'JWT_EXPIRE',
    'API_PORT',
    'NODE_ENV'
  ];

  const missingRequired = [];
  const missingOptional = [];

  // Check required variables
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingRequired.push(varName);
    }
  });

  // Check optional variables and warn if missing
  optionalVars.forEach(varName => {
    if (!process.env[varName]) {
      missingOptional.push(varName);
    }
  });

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET) {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret.length < 32) {
      throw new Error(`JWT_SECRET must be at least 32 characters long. Current length: ${jwtSecret.length}`);
    }
    
    const weakSecrets = [
      'your-default-secret-key',
      'secret',
      'password',
      '123456',
      'admin',
      'test',
      'dev',
      'development',
      'production',
      'jwt-secret',
      'my-secret',
      'default-secret'
    ];
    
    if (weakSecrets.includes(jwtSecret.toLowerCase())) {
      throw new Error('JWT_SECRET cannot be a common weak value. Please use a strong, randomly generated secret.');
    }
  }

  // Validate database credentials
  if (process.env.PG_PASSWORD) {
    const weakPasswords = ['1234', 'password', 'admin', 'root', 'test', '123456'];
    if (weakPasswords.includes(process.env.PG_PASSWORD)) {
      throw new Error('PG_PASSWORD cannot be a common weak password. Please use a strong password.');
    }
  }

  // Validate ALLOWED_ORIGINS format
  if (process.env.ALLOWED_ORIGINS) {
    const origins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    const invalidOrigins = origins.filter(origin => {
      if (!origin) return true;
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) return false;
      if (origin.startsWith('https://')) return false;
      if (origin.startsWith('http://') && origin.includes('localhost')) return false;
      return true;
    });
    
    if (invalidOrigins.length > 0) {
      throw new Error(`Invalid origins in ALLOWED_ORIGINS: ${invalidOrigins.join(', ')}. Only HTTPS domains and localhost are allowed.`);
    }
  }

  // Report results
  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  if (missingOptional.length > 0) {
    console.warn('⚠️  Missing optional environment variables:', missingOptional.join(', '));
    console.warn('   Some features may not work properly without these variables.');
  }

  console.log('✅ Environment variables validated successfully');
  console.log('✅ Required variables:', requiredVars.filter(v => process.env[v]).length, '/', requiredVars.length);
  console.log('✅ Optional variables:', optionalVars.filter(v => process.env[v]).length, '/', optionalVars.length);
};

// Validate and configure CORS origins
const getAllowedOrigins = () => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  const origins = allowedOrigins.split(',').map(origin => origin.trim());
  console.log('✅ CORS origins configured:', origins);
  return origins;
};

const allowedOrigins = getAllowedOrigins();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO via service
const io = initSocket(server, allowedOrigins);

// Handle termination signals gracefully
process.on('SIGTERM', db.gracefulShutdown);
process.on('SIGINT', db.gracefulShutdown);

// Start the server
const startServer = async () => {
  try {
    // Validate environment variables first
    console.log('🔍 Validating environment variables...');
    validateEnvironmentVariables();
    
    // Test database connection first
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }
    
    // Initialize tables
    const tablesInitialized = await db.initTables();
    const migrateUsersTable = await db.migrateUsersTable();
    if (!tablesInitialized) {
      console.error('❌ Table initialization failed');
      process.exit(1);
    }
    
    // Start the server
    server.listen(port, () => {
      console.log(`\n✅ Server running on http://localhost:${port}`);
      console.log(`✅ WebSocket server ready on ws://localhost:${port}`);
      console.log(`\n📋 Available API Routes (via src/modules/):`);
      console.log(`   GET    /health`);
      console.log(`   - /api/auth/* (Standard auth routes)`);
      console.log(`   - /api/auth/google/* (Google OAuth routes)`);
      console.log(`   - /api/dms/* (Direct messaging)`);
      console.log(`   - /api/groups/* (Group chat)`);
      console.log(`   - /api/subscriptions/*`);
      console.log(`   - /api/courses/*`);
      console.log(`   - /api/daily-usage/*`);
      console.log(`   - /api/reports/*`);
      console.log(`   - /api/topics/*`);
      console.log(`   - /api/vocabulary/*`);
      console.log(`   - /api/listening/*`);
      console.log(`   - /api/quizzes/*`);
      console.log(`   - /api/leaderboard/*`);
      console.log(`   - /api/progress/*`);
      console.log(`   - /api/transcripts/*`);
      console.log(`   - /api/onboarding/*`);
      console.log(`   - /api/payment/*`);
      console.log(`   - /api/connection/*`);
      console.log(`   - /api/lifecycle/*\n`);
    });
  } catch (err) {
    console.error('❌ Server startup failed:', err);
    console.error('Error stack:', err.stack);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Stack:', reason?.stack);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

// Start the server
startServer().catch((err) => {
  console.error('❌ Failed to start server:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
});

// Export io instance for use in services
module.exports = { app, server, io, validateEnvironmentVariables };
