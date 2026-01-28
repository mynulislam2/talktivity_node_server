/**
 * Socket.IO Service
 * Encapsulates Socket.IO initialization, auth, and event handlers.
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../../../db');

// Store io instance for use in other modules
let ioInstance = null;

// User-to-socket mapping for efficient lookup
// Map<userId, Set<socketId>>
const userSocketMap = new Map();

/**
 * Get user socket map for efficient socket lookup
 * @returns {Map} User socket map
 */
function getUserSocketMap() {
  return userSocketMap;
}

function initSocket(server, allowedOrigins) {
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    auth: { headers: ['Authorization'] },
  });

  // WebSocket authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      if (!token) {
        console.warn(`⚠️  WebSocket rejected: No token from ${socket.handshake.address}`);
        return next(new Error('Authentication required'));
      }
      const cleanToken = token.replace('Bearer ', '');
      const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      console.log(`✅ WebSocket authenticated: User ${decoded.userId} (${decoded.email})`);
      next();
    } catch (error) {
      console.warn(`⚠️  WebSocket auth failed from ${socket.handshake.address}:`, error.message);
      next(new Error('Invalid authentication token'));
    }
  });

  // Presence map
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    console.log('[Socket.IO] New connection:', socket.id, 'User:', socket.userId);
    const userId = socket.userId;
    if (userId) {
      // Add to user socket map for efficient lookup
      if (!userSocketMap.has(userId)) {
        userSocketMap.set(userId, new Set());
      }
      userSocketMap.get(userId).add(socket.id);
      console.log(`📊 User ${userId} now has ${userSocketMap.get(userId).size} active socket(s)`);
      
      onlineUsers.set(userId, { socketId: socket.id, lastSeen: null });
      io.emit('user_online', { userId });
    }

    // GROUP EVENTS
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
      try {
        const { rows } = await db.pool.query(
          'INSERT INTO group_messages (group_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
          [groupId, socket.userId, content]
        );
        const message = rows[0];
        io.to(room).emit('group_message', { ...message, userId: socket.userId });
      } catch (err) {
        socket.emit('error', { error: 'Failed to send message' });
      }
    });

    socket.on('group_typing', ({ groupId, typing }) => {
      const room = `group:${groupId}`;
      socket.to(room).emit('group_typing', { userId: socket.userId, typing });
    });

    // DM EVENTS
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

    // UNREAD TRACKING
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
      if (userId) {
        // Remove from user socket map
        if (userSocketMap.has(userId)) {
          userSocketMap.get(userId).delete(socket.id);
          if (userSocketMap.get(userId).size === 0) {
            userSocketMap.delete(userId);
            console.log(`📊 User ${userId} has no more active sockets`);
          } else {
            console.log(`📊 User ${userId} now has ${userSocketMap.get(userId).size} active socket(s)`);
          }
        }
        
        onlineUsers.delete(userId);
        const lastSeen = new Date().toISOString();
        io.emit('user_offline', { userId, lastSeen });
      }
      console.log('[Socket.IO] Disconnected:', socket.id, 'Reason:', reason);
    });
  });

  // Store instance for use in other modules
  ioInstance = io;
  return io;
}

function getIO() {
  return ioInstance;
}

module.exports = { initSocket, getIO, getUserSocketMap };
