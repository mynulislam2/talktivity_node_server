/**
 * Agent Module Service
 * Handles agent-to-frontend communication via Socket.IO
 */

const { getIO, getUserSocketMap } = require('../../core/socket/socketService');

const agentService = {
  /**
   * Emit session state event to a specific user's connected Socket.IO client
   * @param {Object} params - Event parameters
   * @param {number} params.userId - User ID to send event to
   * @param {string} params.state - Session state (SAVING_CONVERSATION, SESSION_SAVED, SESSION_SAVE_FAILED)
   * @param {string} [params.callId] - Optional call/room identifier
   * @param {string} [params.message] - Optional message to display
   * @returns {boolean} True if event was emitted, false if user not connected
   */
  async emitSessionStateToUser({ userId, state, callId, message }) {
    const io = getIO();
    
    if (!io) {
      console.error('❌ Socket.IO not initialized');
      return false;
    }

    try {
      // Use user socket map for efficient O(1) lookup
      const userSocketMap = getUserSocketMap();
      const userSocketIds = userSocketMap.get(userId);
      
      if (!userSocketIds || userSocketIds.size === 0) {
        console.warn(`⚠️  No connected sockets found for user ${userId}`);
        return false;
      }

      // Get socket instances from socket IDs
      const userSockets = [];
      const sockets = await io.fetchSockets();
      
      for (const socket of sockets) {
        if (userSocketIds.has(socket.id)) {
          userSockets.push(socket);
        }
      }

      if (userSockets.length === 0) {
        console.warn(`⚠️  No active socket instances found for user ${userId} (map had ${userSocketIds.size} socket ID(s))`);
        return false;
      }

      // Prepare event payload
      const payload = {
        state,
        message,
        call_id: callId,
      };

      // Emit to all of user's connected sockets
      userSockets.forEach(socket => {
        socket.emit('session_state', payload);
      });

      console.log(
        `✅ Emitted session_state event to user ${userId} (${userSockets.length} socket(s)):`,
        payload
      );

      return true;
    } catch (error) {
      console.error(`❌ Error emitting session state to user ${userId}:`, error);
      return false;
    }
  },
};

module.exports = agentService;
