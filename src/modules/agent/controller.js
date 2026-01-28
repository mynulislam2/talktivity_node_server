/**
 * Agent Module Controller
 * HTTP handlers for agent-to-frontend communication
 */

const agentService = require('./service');
const { sendSuccess, sendError } = require('../../core/http/response');

const agentController = {
  /**
   * POST /api/agent/session-state
   * Receive session state from Python agent and emit Socket.IO event to frontend
   */
  async emitSessionState(req, res, next) {
    try {
      const { user_id, state, call_id, message } = req.body;

      // Validate required fields
      if (!user_id || !state) {
        return sendError(res, 'user_id and state are required', 400);
      }

      // Validate state values
      const validStates = ['SAVING_CONVERSATION', 'SESSION_SAVED', 'SESSION_SAVE_FAILED'];
      if (!validStates.includes(state)) {
        return sendError(res, `Invalid state. Must be one of: ${validStates.join(', ')}`, 400);
      }

      // Emit Socket.IO event to user's connected socket
      const success = await agentService.emitSessionStateToUser({
        userId: user_id,
        state,
        callId: call_id,
        message,
      });

      if (success) {
        return sendSuccess(res, { 
          message: 'Session state event emitted successfully',
          userId: user_id,
          state,
        });
      } else {
        return sendError(res, 'Failed to emit session state event (user may not be connected)', 404);
      }
    } catch (error) {
      return next(error);
    }
  },
};

module.exports = agentController;
