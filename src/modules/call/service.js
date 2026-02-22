/**
 * Call Module Service
 * Manages call session tracking and status
 */

const db = require('../../core/db/client');

const callService = {
  /**
   * Check if user can start a call session
   * Returns true if total lifetime duration < 300 seconds
   */
  async canStartCall(userId) {
    const result = await db.queryOne(
      `SELECT 
        COALESCE(SUM(call_duration_seconds), 0) as total_duration
      FROM call_sessions
      WHERE user_id = $1`,
      [userId]
    );

    const totalDuration = parseInt(result?.total_duration || 0);
    const LIFETIME_CALL_LIMIT = 120; // 2 minutes in seconds
    return totalDuration < LIFETIME_CALL_LIMIT;
  },

  /**
   * Get call session statistics for a user
   */
  async getCallStatus(userId) {
    const stats = await db.queryOne(
      `SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN call_completed = true THEN 1 END) as completed_sessions,
        SUM(CAST(COALESCE(call_duration_seconds, 0) AS INTEGER)) as total_duration_seconds,
        AVG(CAST(COALESCE(call_duration_seconds, 0) AS INTEGER)) as avg_duration_seconds,
        MAX(call_started_at) as last_call_at,
        COUNT(CASE WHEN call_duration_seconds >= 120 THEN 1 END) as full_sessions
      FROM call_sessions
      WHERE user_id = $1`,
      [userId]
    );

    // Get recent sessions (last 10)
    const recentSessionsResult = await db.queryAll(
      `SELECT 
        id,
        call_started_at,
        call_ended_at,
        call_duration_seconds,
        call_completed,
        session_type,
        topic_name,
        room_name
      FROM call_sessions
      WHERE user_id = $1
      ORDER BY call_started_at DESC
      LIMIT 10`,
      [userId]
    );
    
    // Extract just the rows array
    const recentSessions = Array.isArray(recentSessionsResult) ? recentSessionsResult : [];

    // Calculate lifetime call information
    const totalDuration = parseInt(stats?.total_duration_seconds || 0);
    const LIFETIME_CALL_LIMIT = 120; // 2 minutes in seconds
    const remaining = Math.max(0, LIFETIME_CALL_LIMIT - totalDuration);
    const canCall = totalDuration < LIFETIME_CALL_LIMIT;

    return {
      statistics: {
        total_sessions: parseInt(stats?.total_sessions || 0),
        completed_sessions: parseInt(stats?.completed_sessions || 0),
        total_duration_seconds: totalDuration,
        avg_duration_seconds: Math.floor(parseFloat(stats?.avg_duration_seconds || 0)),
        last_call_at: stats?.last_call_at || null,
        full_sessions: parseInt(stats?.full_sessions || 0),
      },
      recent_sessions: recentSessions,
      lifetime: {
        totalDuration,
        remaining,
        canCall,
      },
    };
  },
};

module.exports = callService;
