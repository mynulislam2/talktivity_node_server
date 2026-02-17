/**
 * LiveKit Connection Utilities
 * Provides token generation, validation, and metadata building for LiveKit connections
 */

const { AccessToken, VideoGrant } = require('livekit-server-sdk');

// Constants
const VALID_SESSION_TYPES = ['call', 'practice', 'roleplay'];
const DEFAULT_SESSION_TYPE = 'call';
const DEFAULT_USER_LEVEL = 'beginner';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TTL_MINUTES = 60;

/**
 * Validate required LiveKit environment variables
 * @param {string} livekitUrl - LiveKit WebSocket URL
 * @param {string} apiKey - LiveKit API Key
 * @param {string} apiSecret - LiveKit API Secret
 * @throws {Error} if any required variable is missing
 */
function validateEnvironment(livekitUrl, apiKey, apiSecret) {
  if (!livekitUrl || !apiKey || !apiSecret) {
    throw new Error('LiveKit configuration is missing (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)');
  }
}

/**
 * Extract and validate user ID from request parameters
 * @param {Object} params - Query parameters
 * @returns {number} Validated user ID
 * @throws {Error} if user ID is invalid
 */
function extractUserId(params) {
  const userIdParam = params.id || params.userId;
  
  if (!userIdParam) {
    throw new Error('User ID is required. Please provide "id" or "userId" parameter.');
  }
  
  const userId = parseInt(userIdParam, 10);
  
  if (isNaN(userId) || userId <= 0) {
    throw new Error('Invalid user ID format. Must be a positive integer.');
  }
  
  return userId;
}

/**
 * Extract topic data from query parameters or structured topic JSON
 * @param {Object} params - Query parameters
 * @returns {Object} Topic data with title, prompt, firstPrompt
 */
function extractTopicData(params) {
  const topicParam = params.topic;
  
  if (topicParam) {
    try {
      const parsed = JSON.parse(decodeURIComponent(topicParam));
      return {
        title: parsed?.title || '',
        prompt: parsed?.prompt || '',
        firstPrompt: parsed?.firstPrompt || '',
      };
    } catch (error) {
      // Failed to parse topic data, fall through to individual parameters
    }
  }
  
  return {
    title: params.topicTitle || '',
    prompt: params.prompt || '',
    firstPrompt: params.firstPrompt || '',
  };
}

/**
 * Normalize and validate session type
 * @param {string} sessionType - Session type string
 * @returns {string} Validated session type
 */
function normalizeSessionType(sessionType) {
  const normalized = (sessionType || DEFAULT_SESSION_TYPE).toLowerCase();
  return VALID_SESSION_TYPES.includes(normalized) ? normalized : DEFAULT_SESSION_TYPE;
}

/**
 * Build session metadata for LiveKit token
 * @param {number} userId - User ID
 * @param {Object} topic - Topic data
 * @param {Object} params - Query parameters
 * @returns {Object} Session metadata
 */
function buildSessionMetadata(userId, topic, params) {
  const requestedSessionType = params.sessionType || DEFAULT_SESSION_TYPE;
  const userLevel = params.userLevel || DEFAULT_USER_LEVEL;
  
  return {
    userId,
    prompt: topic.prompt,
    firstPrompt: topic.firstPrompt,
    sessionType: normalizeSessionType(requestedSessionType),
    userLevel,
    topic: topic.title,
  };
}

/**
 * Generate a unique room name based on user ID and timestamp
 * @param {number} userId - User ID
 * @returns {string} Unique room name
 */
function generateRoomName(userId) {
  return `room_${userId}_${Date.now()}`;
}

/**
 * Create a LiveKit participant token
 * @param {string} apiKey - LiveKit API Key
 * @param {string} apiSecret - LiveKit API Secret
 * @param {string} identity - Participant identity
 * @param {string} roomName - Room name
 * @param {Object} metadata - Session metadata
 * @param {number} ttlMinutes - Token TTL in minutes (default: 60)
 * @returns {Promise<string>} JWT token
 * @throws {Error} if token generation fails
 */
async function createParticipantToken(apiKey, apiSecret, identity, roomName, metadata, ttlMinutes = DEFAULT_TTL_MINUTES) {
  try {
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      metadata: JSON.stringify(metadata),
      ttl: `${ttlMinutes}m`,
    });

    const grant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    };

    token.addGrant(grant);
    const jwt = await token.toJwt();
    
    // Debug: Verify token is a string
    if (typeof jwt !== 'string') {
      console.error(`❌ Token is not a string: ${typeof jwt}`, jwt);
      throw new Error(`Token generation returned ${typeof jwt} instead of string`);
    }
    
    console.log(`✅ Token generated successfully (${jwt.length} chars)`);
    return jwt;
  } catch (error) {
    console.error(`❌ Token generation failed:`, error.message);
    throw new Error(`Failed to create participant token: ${error.message}`);
  }
}

/**
 * Normalize LiveKit URL (remove trailing slashes)
 * @param {string} url - LiveKit URL
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  return url.replace(/\/+$/, '');
}

module.exports = {
  validateEnvironment,
  extractUserId,
  extractTopicData,
  normalizeSessionType,
  buildSessionMetadata,
  generateRoomName,
  createParticipantToken,
  normalizeUrl,
  VALID_SESSION_TYPES,
  DEFAULT_SESSION_TYPE,
  DEFAULT_USER_LEVEL,
  DEFAULT_LANGUAGE,
  DEFAULT_TTL_MINUTES,
};
