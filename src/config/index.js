// src/config/index.js
// Environment parsing and constants

require('dotenv').config();

// Validate required environment variables
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

  const missingRequired = [];
  
  // Check required variables
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingRequired.push(varName);
    }
  });

  // Report results
  if (missingRequired.length > 0) {
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  console.log('✅ Environment variables validated successfully');
};

// Get configuration values with defaults
const config = {
  // Server configuration
  port: process.env.API_PORT || 8082,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  db: {
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '24h',
    refreshTokenExpire: process.env.REFRESH_TOKEN_EXPIRE || '7d'
  },
  
  // CORS configuration
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || []
  },
  
  // Security configuration
  security: {
    saltRounds: 10
  }
};

module.exports = {
  config,
  validateEnvironmentVariables
};