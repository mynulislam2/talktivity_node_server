/**
 * Application Configuration
 * Load environment variables and constants
 */

require('dotenv').config();

const config = {
  // Server
  PORT: process.env.API_PORT || 8082,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database
  DATABASE: {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'talktivity',
  },

  // JWT
  JWT: {
    SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    EXPIRY: process.env.JWT_EXPIRY || '7d',
  },

  // CORS
  CORS: {
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  },

  // LiveKit
  LIVEKIT: {
    URL: process.env.LIVEKIT_URL || 'http://localhost:7880',
    API_KEY: process.env.LIVEKIT_API_KEY,
    API_SECRET: process.env.LIVEKIT_API_SECRET,
  },

  // LLM (Groq)
  GROQ: {
    API_KEY: process.env.GROQ_API_KEY,
  },

  // Time Limits (in seconds)
  TIME_LIMITS: {
    DAILY_PRACTICE: parseInt(process.env.DAILY_PRACTICE_SECONDS || '300'), // 5 min
    DAILY_ROLEPLAY_BASIC: parseInt(process.env.DAILY_ROLEPLAY_BASIC_SECONDS || '300'), // 5 min
    DAILY_ROLEPLAY_PRO: parseInt(process.env.DAILY_ROLEPLAY_PRO_SECONDS || '3300'), // 55 min
    LIFETIME_ONBOARDING: parseInt(process.env.LIFETIME_ONBOARDING_SECONDS || '300'), // 5 min
  },

  // OAuth (Optional)
  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  },

  // Admin
  ADMIN_SETUP_TOKEN: process.env.ADMIN_SETUP_TOKEN,
};

module.exports = config;
