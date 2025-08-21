// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

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
  // This function now relies on validateEnvironmentVariables() being called first
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  
  // Parse comma-separated origins
  const origins = allowedOrigins.split(',').map(origin => origin.trim());
  
  console.log('✅ CORS origins configured:', origins);
  return origins;
};

const allowedOrigins = getAllowedOrigins();

const onboardingRoutes = require('./routes/onboarding-routes');
const googleRoutes = require('./routes/google_auth');
const topicRoutes = require('./routes/topic-routes');
const courseRoutes = require('./routes/course-routes');
const dailyReportsRoutes = require('./routes/daily-reports');
const adminRoutes = require('./routes/admin-routes');
const http = require('http');
const { Server } = require('socket.io');

// Import database module (with pool and DB functions)
const db = require('./db');

// Import routes (AFTER db module is imported)
const authRoutes = require('./routes/auth-routes');
const transcriptRoutes = require('./routes/transcript-routes');
const groupChatRoutes = require('./routes/group-chat');
const dmRoutes = require('./routes/dm');

// Create Express app
const app = express();
const port = process.env.API_PORT || 8082;

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

// Rate limiting middleware
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 500 : 100, // More lenient in dev
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 50 : 10, // More lenient in dev
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 20, // More lenient in dev
  message: {
    success: false,
    error: 'Too many admin requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Apply rate limiting
app.use(globalLimiter);

// Secure CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Request logging middleware (simple)
app.use((req, res, next) => {
  // Remove any debug logging or temporary debug code
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


app.use('/api/auth', authLimiter, googleRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', transcriptRoutes);
app.use('/api', onboardingRoutes);
app.use('/api', topicRoutes);
app.use('/api', courseRoutes);
app.use('/api/daily-reports', dailyReportsRoutes);
app.use('/api/admin', adminLimiter, adminRoutes);
app.use('/api/groups', groupChatRoutes);
app.use('/api/dms', dmRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Remove any debug logging or temporary debug code
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error:'Internal server error'
  });
});


// Handle termination signals
process.on('SIGTERM', db.gracefulShutdown);
process.on('SIGINT', db.gracefulShutdown);

// Create HTTP server and wrap Express app
const server = http.createServer(app);

// Initialize Socket.IO with secure configuration
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Allow both WebSocket and polling
  allowEIO3: true, // Allow Engine.IO v3 clients
  pingTimeout: 60000,
  pingInterval: 25000,
  // Add authentication middleware
  auth: {
    headers: ['Authorization']
  }
});

// WebSocket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!token) {
      console.warn(`⚠️  WebSocket connection rejected: No authentication token from ${socket.handshake.address}`);
      return next(new Error('Authentication required'));
    }
    
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');
    
    // Verify JWT token
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
    
    // Attach user info to socket
    socket.userId = decoded.userId;
    socket.userEmail = decoded.email;
    
    console.log(`✅ WebSocket authenticated: User ${decoded.userId} (${decoded.email}) from ${socket.handshake.address}`);
    next();
  } catch (error) {
    console.warn(`⚠️  WebSocket authentication failed from ${socket.handshake.address}:`, error.message);
    next(new Error('Invalid authentication token'));
  }
});

// In-memory presence map: userId -> { socketId, lastSeen }
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('[Socket.IO] New authenticated connection:', socket.id, 'User:', socket.userId);
  console.log('[Socket.IO] Transport:', socket.conn.transport.name);
  
  // Use authenticated userId instead of query parameter
  const userId = socket.userId;
  if (userId) {
    onlineUsers.set(userId, { socketId: socket.id, lastSeen: null });
    io.emit('user_online', { userId });
  }

  // --- GROUP CHAT EVENTS ---
  socket.on('join_group', ({ groupId }) => {
    const room = `group:${groupId}`;
    socket.join(room);
    io.to(room).emit('user_joined', { userId: socket.userId });
  });

  socket.on('leave_group', ({ groupId }) => {
    const room = `group:${groupId}`;
    socket.leave(room);
    io.to(room).emit('user_left', { userId: socket.userId });
  });

  socket.on('group_message', async ({ groupId, content }) => {
    const room = `group:${groupId}`;
    console.log('[Socket.IO] Received group_message:', { groupId, userId: socket.userId, content });
    // Store message in DB
    try {
      const { rows } = await db.pool.query(
        'INSERT INTO group_messages (group_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
        [groupId, socket.userId, content]
      );
      const message = rows[0];
      console.log('[Socket.IO] Saved message to DB:', message);
      io.to(room).emit('group_message', { ...message, userId: socket.userId });
      console.log('[Socket.IO] Broadcasted group_message to room:', room);
    } catch (err) {
      console.error('[Socket.IO] Failed to send message:', err);
      socket.emit('error', { error: 'Failed to send message' });
    }
  });

  socket.on('group_typing', ({ groupId, typing }) => {
    const room = `group:${groupId}`;
    socket.to(room).emit('group_typing', { userId: socket.userId, typing });
  });

  // --- DM CHAT EVENTS ---
  socket.on('join_dm', ({ otherUserId }) => {
    const room = `dm:${[socket.userId, otherUserId].sort().join(':')}`;
    socket.join(room);
  });

  socket.on('leave_dm', ({ otherUserId }) => {
    const room = `dm:${[socket.userId, otherUserId].sort().join(':')}`;
    socket.leave(room);
  });

  socket.on('dm_message', async ({ dmId, receiverId, content }) => {
    const room = `dm:${[socket.userId, receiverId].sort().join(':')}`;
    // Store message in DB
    try {
      const { rows } = await db.pool.query(
        'INSERT INTO dm_messages (dm_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
        [dmId, socket.userId, content]
      );
      const message = rows[0];
      io.to(room).emit('dm_message', { ...message, senderId: socket.userId });
    } catch (err) {
      socket.emit('error', { error: 'Failed to send DM' });
    }
  });

  socket.on('dm_typing', ({ otherUserId, typing }) => {
    const room = `dm:${[socket.userId, otherUserId].sort().join(':')}`;
    socket.to(room).emit('dm_typing', { userId: socket.userId, typing });
  });

  // --- UNREAD TRACKING ---
  socket.on('mark_group_read', async ({ groupId }) => {
    try {
      await db.pool.query(
        `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND group_id = $2;
         INSERT INTO last_read_at (user_id, group_id, last_read_at)
         SELECT $1, $2, NOW()
         WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND group_id = $2);`,
        [socket.userId, groupId]
      );
    } catch (err) {}
  });
  
  socket.on('mark_dm_read', async ({ dmId }) => {
    try {
      await db.pool.query(
        `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND dm_id = $2;
         INSERT INTO last_read_at (user_id, dm_id, last_read_at)
         SELECT $1, $2, NOW()
         WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND dm_id = $2);`,
        [socket.userId, dmId]
      );
    } catch (err) {}
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.IO] Authenticated client disconnected:', socket.id, 'User:', socket.userId, 'Reason:', reason);
    if (userId) {
      onlineUsers.delete(userId);
      const lastSeen = new Date().toISOString();
      io.emit('user_offline', { userId, lastSeen });
    }
  });
});

// Start the server
const startServer = async () => {
  try {
    // Validate environment variables first
    console.log('🔍 Validating environment variables...');
    validateEnvironmentVariables();
    
    // Test database connection first
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      // Remove any debug logging or temporary debug code
      process.exit(1);
    }
    
    // Initialize tables
    const tablesInitialized = await db.initTables();
    const migrateUsersTable = await db.migrateUsersTable();
    if (!tablesInitialized) {
      // Remove any debug logging or temporary debug code
      process.exit(1);
    }
    
    // Start the server (now using HTTP server for Socket.IO)
    server.listen(port, () => {
      // Remove any debug logging or temporary debug code
      console.log(`Server running on http://localhost:${port}`);
      console.log(`WebSocket server ready on ws://localhost:${port}`);
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
      
    });
  } catch (err) {
    // Remove any debug logging or temporary debug code
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = { app, server, io, validateEnvironmentVariables };