/**
 * LiveKit Connection Controller
 * HTTP handlers for LiveKit connection endpoints
 */

const livekitConnectionService = require('./service');
const { sendSuccess, sendError } = require('../../core/http/response');

const livekitConnectionController = {
  /**
   * GET /api/livekit/connection-details
   * Get LiveKit connection details for starting a voice session
   * 
   * Query Parameters:
   * - id (required): User ID
   * - sessionType (optional): 'call', 'practice', or 'roleplay' (default: 'call')
   * - topic (optional): JSON-encoded topic data { title, prompt, firstPrompt }
   * - topicTitle (optional): Topic title
   * - prompt (optional): System prompt
   * - firstPrompt (optional): First prompt to send to user
   * - userLevel (optional): User level (default: 'beginner')
   * - ttlMinutes (optional): Token TTL in minutes (default: 60)
   */
  async getConnectionDetails(req, res, next) {
    try {
      const config = {
        LIVEKIT_URL: process.env.LIVEKIT_URL,
        LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
      };

      console.log(`📍 [LiveKit] Connection request from ${req.ip}`);
      console.log(`📋 [LiveKit] Query params:`, JSON.stringify(req.query));
      
      // Validate parameters
      livekitConnectionService.validateConnectionParams(req.query);

      // Get connection details
      const connectionDetails = await livekitConnectionService.getConnectionDetails(
        req.query,
        config
      );

      console.log(`📤 [Controller] Sending response - serverUrl: ${connectionDetails.serverUrl}, token type: ${typeof connectionDetails.participantToken}, roomName: ${connectionDetails.roomName}`);
      return sendSuccess(res, connectionDetails, 200, 'Connection details generated');
    } catch (error) {
      console.error(`❌ [Controller] Error in getConnectionDetails:`, error.message);
      console.error(`   Stack:`, error.stack);
      return next(error);
    }
  },

  /**
   * GET /api/livekit/token
   * Alternative endpoint to get just the LiveKit token
   * Same parameters as /connection-details but returns only the token
   */
  async generateToken(req, res, next) {
    try {
      const config = {
        LIVEKIT_URL: process.env.LIVEKIT_URL,
        LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
        LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
      };

      // Validate parameters
      livekitConnectionService.validateConnectionParams(req.query);

      // Get connection details
      const connectionDetails = await livekitConnectionService.getConnectionDetails(
        req.query,
        config
      );

      // Return only the token
      return sendSuccess(
        res,
        {
          token: connectionDetails.participantToken,
          roomName: connectionDetails.roomName,
          serverUrl: connectionDetails.serverUrl,
          participantName: connectionDetails.participantName,
        },
        200,
        'Token generated'
      );
    } catch (error) {
      return next(error);
    }
  },
};

module.exports = livekitConnectionController;
