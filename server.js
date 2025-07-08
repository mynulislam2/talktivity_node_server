// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();


const onboardingRoutes = require('./routes/onboarding-routes');
const googleRoutes = require('./routes/google_auth');
const topicRoutes = require('./routes/topic-routes');
const courseRoutes = require('./routes/course-routes');
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
const port = process.env.API_PORT || 8081;

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit payload size
// app.use(cors({
//   origin: process.env.CORS_ORIGIN || '*', // Restrict CORS if needed
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization']
  
// }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // ✅ Only if you use cookies or auth headers
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


app.use('/api/auth', googleRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', transcriptRoutes);
app.use('/api', onboardingRoutes);
app.use('/api', topicRoutes);
app.use('/api', courseRoutes);
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
    error: err.message || 'Internal server error'
  });
});


// Handle termination signals
process.on('SIGTERM', db.gracefulShutdown);
process.on('SIGINT', db.gracefulShutdown);

// Create HTTP server and wrap Express app
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// In-memory presence map: userId -> { socketId, lastSeen }
const onlineUsers = new Map();

io.on('connection', (socket) => {
  // Expect userId in handshake query for presence
  const userId = socket.handshake.query.userId;
  if (userId) {
    onlineUsers.set(userId, { socketId: socket.id, lastSeen: null });
    io.emit('user_online', { userId });
  }

  // --- GROUP CHAT EVENTS ---
  socket.on('join_group', ({ groupId, userId }) => {
    const room = `group:${groupId}`;
    socket.join(room);
    io.to(room).emit('user_joined', { userId });
  });

  socket.on('leave_group', ({ groupId, userId }) => {
    const room = `group:${groupId}`;
    socket.leave(room);
    io.to(room).emit('user_left', { userId });
  });

  socket.on('group_message', async ({ groupId, userId, content }) => {
    const room = `group:${groupId}`;
    console.log('[Socket.IO] Received group_message:', { groupId, userId, content });
    // Store message in DB
    try {
      const { rows } = await db.pool.query(
        'INSERT INTO group_messages (group_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
        [groupId, userId, content]
      );
      const message = rows[0];
      console.log('[Socket.IO] Saved message to DB:', message);
      io.to(room).emit('group_message', { ...message, userId });
      console.log('[Socket.IO] Broadcasted group_message to room:', room);
    } catch (err) {
      console.error('[Socket.IO] Failed to send message:', err);
      socket.emit('error', { error: 'Failed to send message' });
    }
  });

  socket.on('group_typing', ({ groupId, userId, typing }) => {
    const room = `group:${groupId}`;
    socket.to(room).emit('group_typing', { userId, typing });
  });

  // --- DM CHAT EVENTS ---
  socket.on('join_dm', ({ userId, otherUserId }) => {
    const room = `dm:${[userId, otherUserId].sort().join(':')}`;
    socket.join(room);
  });

  socket.on('leave_dm', ({ userId, otherUserId }) => {
    const room = `dm:${[userId, otherUserId].sort().join(':')}`;
    socket.leave(room);
  });

  socket.on('dm_message', async ({ dmId, senderId, receiverId, content }) => {
    const room = `dm:${[senderId, receiverId].sort().join(':')}`;
    // Store message in DB
    try {
      const { rows } = await db.pool.query(
        'INSERT INTO dm_messages (dm_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
        [dmId, senderId, content]
      );
      const message = rows[0];
      io.to(room).emit('dm_message', { ...message, senderId });
    } catch (err) {
      socket.emit('error', { error: 'Failed to send DM' });
    }
  });

  socket.on('dm_typing', ({ userId, otherUserId, typing }) => {
    const room = `dm:${[userId, otherUserId].sort().join(':')}`;
    socket.to(room).emit('dm_typing', { userId, typing });
  });

  // --- UNREAD TRACKING ---
  socket.on('mark_group_read', async ({ groupId, userId }) => {
    try {
      await db.pool.query(
        `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND group_id = $2;
         INSERT INTO last_read_at (user_id, group_id, last_read_at)
         SELECT $1, $2, NOW()
         WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND group_id = $2);`,
        [userId, groupId]
      );
    } catch (err) {}
  });
  socket.on('mark_dm_read', async ({ dmId, userId }) => {
    try {
      await db.pool.query(
        `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND dm_id = $2;
         INSERT INTO last_read_at (user_id, dm_id, last_read_at)
         SELECT $1, $2, NOW()
         WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND dm_id = $2);`,
        [userId, dmId]
      );
    } catch (err) {}
  });

  socket.on('disconnect', () => {
    if (userId) {
      onlineUsers.delete(userId);
      const lastSeen = new Date().toISOString();
      io.emit('user_offline', { userId, lastSeen });
    }
    // Optionally handle user disconnect logic
  });
});

// Start the server
const startServer = async () => {
  try {
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

module.exports = { app, server, io };