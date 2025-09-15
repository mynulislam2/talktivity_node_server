// src/core/socket/index.js
// Socket.IO setup and configuration

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/client');
const { getAllowedOrigins } = require('../http/middlewares/cors');
const { config } = require('../../config');

// Initialize Socket.IO with secure configuration
const setupSocketIO = (server) => {
  const allowedOrigins = getAllowedOrigins();
  
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
      const decoded = jwt.verify(cleanToken, config.jwt.secret);
      
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
        const client = await pool.connect();
        try {
          const { rows } = await client.query(
            'INSERT INTO group_messages (group_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
            [groupId, socket.userId, content]
          );
          const message = rows[0];
          console.log('[Socket.IO] Saved message to DB:', message);
          io.to(room).emit('group_message', { ...message, userId: socket.userId });
          console.log('[Socket.IO] Broadcasted group_message to room:', room);
        } finally {
          client.release();
        }
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
        const client = await pool.connect();
        try {
          const { rows } = await client.query(
            'INSERT INTO dm_messages (dm_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
            [dmId, socket.userId, content]
          );
          const message = rows[0];
          io.to(room).emit('dm_message', { ...message, senderId: socket.userId });
        } finally {
          client.release();
        }
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
        const client = await pool.connect();
        try {
          await client.query(
            `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND group_id = $2;
             INSERT INTO last_read_at (user_id, group_id, last_read_at)
             SELECT $1, $2, NOW()
             WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND group_id = $2);`,
            [socket.userId, groupId]
          );
        } finally {
          client.release();
        }
      } catch (err) {}
    });
    
    socket.on('mark_dm_read', async ({ dmId }) => {
      try {
        const client = await pool.connect();
        try {
          await client.query(
            `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND dm_id = $2;
             INSERT INTO last_read_at (user_id, dm_id, last_read_at)
             SELECT $1, $2, NOW()
             WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND dm_id = $2);`,
            [socket.userId, dmId]
          );
        } finally {
          client.release();
        }
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

  return io;
};

module.exports = { setupSocketIO };