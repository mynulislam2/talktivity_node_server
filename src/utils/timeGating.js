/**
 * Time-Gating Utilities
 * Handles time limit checks for different session types and subscription plans
 */

const db = require('../core/db/client');
const { ValidationError } = require('../core/error/errors');

// Daily pool limits (in seconds)
// NOTE: Practice and roleplay have INDEPENDENT daily caps
// - Basic/FreeTrial: 5 min practice + 5 min roleplay (separate)
// - Pro: 10 min practice + 10 min roleplay (separate)
const DAILY_LIMITS = {
  practice_basic: 5 * 60, // 5 minutes per day for Basic/FreeTrial practice
  practice_pro: 10 * 60, // 10 minutes per day for Pro practice
  roleplay_basic: 5 * 60, // 5 minutes per day for Basic/FreeTrial roleplay
  roleplay_pro: 10 * 60, // 10 minutes per day for Pro roleplay
};

const LIFETIME_LIMITS = {
  onboarding: 2 * 60, // 120 seconds (matches LIFETIME_CALL_LIMIT in call/service.js)
};

/**
 * Get remaining time for practice session (plan-aware)
 */
async function getRemainingPracticeTime(userId, planType) {
  const today = new Date().toISOString().split('T')[0];

  const result = await db.queryOne(
    `SELECT COALESCE(SUM(CAST(COALESCE(speaking_duration_seconds, 0) AS INTEGER)), 0) as practice_total
     FROM daily_progress
     WHERE user_id = $1 AND progress_date = $2`,
    [userId, today]
  );

  const usedSeconds = result?.practice_total || 0;
  const limitSeconds = planType === 'Pro' ? DAILY_LIMITS.practice_pro : DAILY_LIMITS.practice_basic;
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);

  return { usedSeconds, remainingSeconds, limitSeconds };
}

/**
 * Get remaining time for roleplay session (plan-aware)
 */
async function getRemainingRoleplayTime(userId, planType) {
  const today = new Date().toISOString().split('T')[0];

  const result = await db.queryOne(
    `SELECT COALESCE(SUM(CAST(COALESCE(roleplay_duration_seconds, 0) AS INTEGER)), 0) as roleplay_total
     FROM daily_progress
     WHERE user_id = $1 AND progress_date = $2`,
    [userId, today]
  );

  const usedSeconds = result?.roleplay_total || 0;
  const limitSeconds = planType === 'Pro' ? DAILY_LIMITS.roleplay_pro : DAILY_LIMITS.roleplay_basic;
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);

  return { usedSeconds, remainingSeconds, limitSeconds };
}

/**
 * Check if user can start a practice session
 */
async function canStartPracticeSession(userId, planType) {
  const { remainingSeconds } = await getRemainingPracticeTime(userId, planType);
  return remainingSeconds > 0;
}

/**
 * Check if user can start a roleplay session
 */
async function canStartRoleplaySession(userId, planType) {
  const { remainingSeconds } = await getRemainingRoleplayTime(userId, planType);
  return remainingSeconds > 0;
}

/**
 * Get remaining lifetime call time for a user
 * Checks total call_duration_seconds across all call_sessions
 */
async function getRemainingLifetimeCallTime(userId) {
  const result = await db.queryOne(
    `SELECT COALESCE(SUM(call_duration_seconds), 0) as total_duration
     FROM call_sessions
     WHERE user_id = $1`,
    [userId]
  );

  const usedSeconds = result?.total_duration || 0;
  const limitSeconds = LIFETIME_LIMITS.onboarding;
  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);

  return { usedSeconds, remainingSeconds, limitSeconds };
}

/**
 * Check if onboarding user can use lifetime pool
 */
async function canUseLifetimeCall(userId) {
  const { remainingSeconds } = await getRemainingLifetimeCallTime(userId);
  return remainingSeconds > 0;
}

/**
 * Calculate TTL in minutes for LiveKit token
 * Token expires after (remaining_seconds / 60) minutes
 */
async function calculateTokenTTL(userId, sessionType, planType = 'Basic') {
  try {
    if (sessionType === 'call') {
      const { remainingSeconds } = await getRemainingLifetimeCallTime(userId);
      // Hard cap: any call session TTL max 5 minutes
      const callCapSeconds = 5 * 60;
      return Math.floor(Math.min(remainingSeconds, callCapSeconds) / 60);
    }

    if (sessionType === 'practice') {
      const { remainingSeconds } = await getRemainingPracticeTime(userId, planType);
      return Math.floor(remainingSeconds / 60);
    }

    // Default roleplay (will be plan-specific at call time)
    const { remainingSeconds } = await getRemainingRoleplayTime(userId, planType);
    return Math.floor(remainingSeconds / 60);
  } catch (error) {
    console.error('Error calculating TTL:', error);
    return 5; // 5 min default
  }
}

module.exports = {
  DAILY_LIMITS,
  LIFETIME_LIMITS,
  getRemainingPracticeTime,
  getRemainingRoleplayTime,
  getRemainingLifetimeCallTime,
  canStartPracticeSession,
  canStartRoleplaySession,
  canUseLifetimeCall,
  calculateTokenTTL,
};
