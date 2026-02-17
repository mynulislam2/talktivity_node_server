/**
 * LiveKit Connection Service
 * Business logic for generating LiveKit connection details and tokens
 */

const {
  validateEnvironment,
  extractUserId,
  extractTopicData,
  buildSessionMetadata,
  generateRoomName,
  createParticipantToken,
  normalizeUrl,
  DEFAULT_TTL_MINUTES,
} = require('./utils');
const { ValidationError } = require('../../core/error/errors');

const livekitConnectionService = {
  /**
   * Get connection details for a LiveKit session
   * @param {Object} params - Request parameters
   * @param {string} params.sessionType - Session type (call, practice, roleplay)
   * @param {Object} params.topic - Topic data
   * @param {string} params.userLevel - User level
   * @param {number} params.ttlMinutes - Token TTL in minutes
   * @param {Object} config - Configuration object
   * @param {string} config.LIVEKIT_URL - LiveKit WebSocket URL
   * @param {string} config.LIVEKIT_API_KEY - LiveKit API Key
   * @param {string} config.LIVEKIT_API_SECRET - LiveKit API Secret
   * @returns {Promise<Object>} Connection details
   */
  async getConnectionDetails(params, config) {
    // Validate environment
    validateEnvironment(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);

    console.log(`🔗 [LiveKit Service] LIVEKIT_URL from env: ${config.LIVEKIT_URL}`);

    // Extract and validate parameters
    const userId = extractUserId(params);
    const sessionType = params.sessionType || 'call';
    const participantIdentity = userId.toString();
    const roomName = generateRoomName(userId);
    const topic = extractTopicData(params);
    const ttlMinutes = params.ttlMinutes || DEFAULT_TTL_MINUTES;

    // Build metadata
    const metadata = buildSessionMetadata(userId, topic, { sessionType, ...params });

    console.log(`🎫 [LiveKit Service] Generating token for user ${userId} | room: ${roomName} | sessionType: ${sessionType}`);

    // Create token
    const participantToken = await createParticipantToken(
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
      participantIdentity,
      roomName,
      metadata,
      ttlMinutes
    );

    // Normalize URL
    const normalizedServerUrl = normalizeUrl(config.LIVEKIT_URL);
    
    console.log(`🌐 [LiveKit Service] Normalized serverUrl: ${normalizedServerUrl}`);
    console.log(`📊 [LiveKit Service] Token length: ${participantToken.length} chars | TTL: ${ttlMinutes} min`);

    const response = {
      serverUrl: normalizedServerUrl,
      roomName,
      participantToken,
      participantName: participantIdentity,
      sessionType,
      userId,
      createdAt: new Date().toISOString(),
    };
    
    console.log(`✅ [LiveKit Service] Connection details ready`);
    console.log(`   → serverUrl: ${response.serverUrl}`);
    console.log(`   → roomName: ${response.roomName}`);
    console.log(`   → participantToken type: ${typeof response.participantToken}`);
    
    return response;
  },

  /**
   * Validate connection parameters
   * @param {Object} params - Request parameters
   * @throws {ValidationError} if parameters are invalid
   */
  validateConnectionParams(params) {
    try {
      extractUserId(params);
    } catch (error) {
      throw new ValidationError(error.message);
    }

    const sessionType = params.sessionType || 'call';
    const validSessionTypes = ['call', 'practice', 'roleplay'];
    if (!validSessionTypes.includes(sessionType)) {
      throw new ValidationError(`Invalid session type: ${sessionType}. Must be one of: ${validSessionTypes.join(', ')}`);
    }
  },
};

module.exports = livekitConnectionService;
