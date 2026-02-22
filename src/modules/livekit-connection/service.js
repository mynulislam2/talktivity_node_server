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
const db = require('../../core/db/client');

const livekitConnectionService = {
  /**
   * Check if user can start a session based on time limits
   * @param {number} userId - User ID
   * @param {string} sessionType - Session type (call, practice, roleplay)
   * @throws {ValidationError} if user has exceeded time limits
   */
  async validateTimeLimit(userId, sessionType) {
    // Call sessions: check lifetime limit (2 minutes)
    if (sessionType === 'call') {
      const result = await db.queryOne(
        `SELECT COALESCE(SUM(call_duration_seconds), 0) as total_duration
         FROM call_sessions WHERE user_id = $1`,
        [userId]
      );
      const totalDuration = parseInt(result?.total_duration || 0);
      const LIFETIME_CALL_LIMIT = 120; // 2 minutes
      if (totalDuration >= LIFETIME_CALL_LIMIT) {
        throw new ValidationError('Call session lifetime limit (2 minutes) has been reached');
      }
      return; // Call sessions can proceed
    }

    // Practice/roleplay: check daily limits
    const subscription = await db.queryOne(
      `SELECT sp.plan_type FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()`,
      [userId]
    );

    if (!subscription) {
      throw new ValidationError('No active subscription found');
    }

    const planType = subscription.plan_type;
    const PRACTICE_CAP_BASIC = 5 * 60; // 5 minutes
    const PRACTICE_CAP_PRO = 10 * 60; // 10 minutes
    const ROLEPLAY_CAP_BASIC = 5 * 60;
    const ROLEPLAY_CAP_PRO = 10 * 60;

    const today = new Date().toISOString().split('T')[0];
    const progress = await db.queryOne(
      `SELECT speaking_duration_seconds, roleplay_duration_seconds FROM daily_progress
       WHERE user_id = $1 AND progress_date = $2`,
      [userId, today]
    );

    if (sessionType === 'practice') {
      const used = parseInt(progress?.speaking_duration_seconds || 0);
      const cap = planType === 'Pro' ? PRACTICE_CAP_PRO : PRACTICE_CAP_BASIC;
      if (used >= cap) {
        throw new ValidationError(`Practice session daily limit (${cap / 60} minutes) has been reached`);
      }
    }

    if (sessionType === 'roleplay') {
      const used = parseInt(progress?.roleplay_duration_seconds || 0);
      const cap = planType === 'Pro' ? ROLEPLAY_CAP_PRO : ROLEPLAY_CAP_BASIC;
      if (used >= cap) {
        throw new ValidationError(`Roleplay session daily limit (${cap / 60} minutes) has been reached`);
      }
    }
  },

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

    // Validate time limits before issuing token
    console.log(`⏱️ [LiveKit Service] Checking time limits for user ${userId} | sessionType: ${sessionType}`);
    await this.validateTimeLimit(userId, sessionType);

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
