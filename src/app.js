const express = require('express');
const cors = require('cors');
const config = require('./config');
const errorHandler = require('./core/error/errorHandler');
const { securityHeaders, sanitizeInput, globalLimiter } = require('./core/http/middlewares/security');

const app = express();

// Middleware: Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Trust proxy when behind render/ingress
app.set('trust proxy', 1);

// Security headers
app.use(securityHeaders);

// Global rate limiter
app.use(globalLimiter);

// Input sanitization
app.use(sanitizeInput);

// Middleware: CORS
app.use(cors({
  origin: config.CORS.ALLOWED_ORIGINS,
  credentials: true,
}));

// Middleware: Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes - Postman-aligned surface
const { authRouter, googleAuthRouter } = require('./modules/auth');
const { adminRouter } = require('./modules/admin');
const { dmsRouter } = require('./modules/dms');
const { groupsRouter } = require('./modules/groups');
const { subscriptionsRouter } = require('./modules/subscriptions');
const { coursesRouter } = require('./modules/courses');
const { reportsRouter } = require('./modules/reports');
const { topicsRouter } = require('./modules/topics');
const { roleplaysRouter } = require('./modules/roleplays');
const { vocabularyRouter } = require('./modules/vocabulary');
const { listeningRouter } = require('./modules/listening');
const { quizzesRouter } = require('./modules/quizzes');
const { leaderboardRouter } = require('./modules/leaderboard');
const { progressRouter } = require('./modules/progress');
const { onboardingRouter } = require('./modules/onboarding');
const { paymentRouter } = require('./modules/payment');
const { lifecycleRouter } = require('./modules/user-lifecycle');
const { discountTokensRouter } = require('./modules/discount-tokens');
const { router: callRouter } = require('./modules/call');
const { router: agentRouter } = require('./modules/agent');
const { router: aiRouter } = require('./modules/ai');

// Mount routes - 54 core APIs
app.use('/api/auth', authRouter);
// Mount Google auth routes under the same /api/auth namespace
// → /api/auth/google, /api/auth/google-token, /api/auth/refresh, /api/auth/auto-verify-emails
app.use('/api/auth', googleAuthRouter);
// Admin routes
app.use('/api/admin', adminRouter);
app.use('/api/dms', dmsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/roleplays', roleplaysRouter);
app.use('/api/vocabulary', vocabularyRouter);
app.use('/api/listening', listeningRouter);
app.use('/api/quizzes', quizzesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/progress', progressRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/lifecycle', lifecycleRouter);
app.use('/api/discount-tokens', discountTokensRouter);
app.use('/api/call', callRouter);
app.use('/api/agent', agentRouter);
app.use('/api/ai', aiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    code: 'NOT_FOUND',
    path: req.path,
  });
});

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
