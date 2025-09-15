// src/app.js
// Express app creation and middleware setup

const express = require('express');
const helmet = require('helmet');
const { globalLimiter, authLimiter, adminLimiter, groupLimiter } = require('./core/http/middlewares/rateLimit');
const { corsMiddleware } = require('./core/http/middlewares/cors');
const { requestLogger } = require('./core/http/middlewares/requestLogger');
const { errorHandler } = require('./core/error/errorHandler');

// Import module routers
const { router: authRouter } = require('./modules/auth');
const { router: groupsRouter } = require('./modules/groups');
const { router: transcriptsRouter } = require('./modules/transcripts');
const { router: topicsRouter } = require('./modules/topics');
const { router: reportsRouter } = require('./modules/reports');
const { router: listeningRouter } = require('./modules/listening');
const { router: leaderboardRouter } = require('./modules/leaderboard');
const { router: vocabularyRouter } = require('./modules/vocabulary');
const { router: dmRouter } = require('./modules/dm');
const { router: quizRouter } = require('./modules/quiz');
const { router: onboardingRouter } = require('./modules/onboarding');
const { router: adminRouter } = require('./modules/admin');

// Import database module
const db = require('./core/db/client');

// Import configuration
const { config } = require('./config');

// Create Express app
const app = express();

// Trust proxy configuration - required when running behind a proxy
app.set('trust proxy', 1);

// Security middleware - Helmet.js for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow Socket.IO to work
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Socket.IO
}));

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit payload size

// Global input sanitization middleware
app.use((req, res, next) => {
  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove potential XSS vectors
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
          .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
      }
    });
  }
  
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
          .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
      }
    });
  }
  
  next();
});

// Apply rate limiting
app.use(globalLimiter);

// Apply CORS middleware
app.use(corsMiddleware);

// Apply request logging middleware
app.use(requestLogger);

// Health check endpoint with DB connection status
app.get('/health', async (req, res) => {
  try {
    const dbConnected = await db.testConnection();
    
    res.status(200).json({ 
      status: 'OK', 
      message: 'Server is up and running',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      database: {
        connected: dbConnected,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Mount module routers
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/groups', groupLimiter, groupsRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/listening', listeningRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/vocabulary', vocabularyRouter);
app.use('/api/dm', dmRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/admin', adminLimiter, adminRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);

module.exports = app;