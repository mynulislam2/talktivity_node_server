/**
 * Time-Gating Utilities
 * Handles time limit checks for different session types and subscription plans
 */

const db = require('../core/db/client');
const { ValidationError } = require('../core/error/errors');

// Daily pool limits (in seconds)
const DAILY_LIMITS = {
  practice: 5 * 60, // 300 seconds
  roleplay_basic: 5 * 60, // 300 seconds for Basic/FreeTrial
  roleplay_pro: 55 * 60, // 3300 seconds for Pro
  total_basic: 5 * 60, // 300 seconds for Basic/FreeTrial
  total_pro: 60 * 60, // 3600 seconds for Pro
};

const LIFETIME_LIMITS = {
  onboarding: 5 * 60, // 300 seconds (one test call)
};

/**
 * Get remaining time for practice session
 */
async function getRemainingPracticeTime(userId) {
  const today = new Date().toISOString().split('T')[0];

  const result = await db.queryOne(
    `SELECT COALESCE(COUNT(*), 0) as practice_count
     FROM daily_progress
     WHERE user_id = $1 AND progress_date = $2 AND speaking_completed = true`,
    [userId, today]
  );

  const usedCount = result?.practice_count || 0;
  // Each speaking session counts as using 300 seconds from daily limit
  const usedSeconds = usedCount * 300;
  const remainingSeconds = Math.max(0, DAILY_LIMITS.practice - usedSeconds);

  return { usedSeconds, remainingSeconds, limitSeconds: DAILY_LIMITS.practice };
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
async function canStartPracticeSession(userId) {
  const { remainingSeconds } = await getRemainingPracticeTime(userId);
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
async function calculateTokenTTL(userId, sessionType) {
  try {
    if (sessionType === 'call') {
      const { remainingSeconds } = await getRemainingLifetimeCallTime(userId);
      // Hard cap: any call session TTL max 5 minutes
      const callCapSeconds = 5 * 60;
      return Math.floor(Math.min(remainingSeconds, callCapSeconds) / 60);
    }

    if (sessionType === 'practice') {
      const { remainingSeconds } = await getRemainingPracticeTime(userId);
      return Math.floor(remainingSeconds / 60);
    }

    // Default roleplay (will be plan-specific at call time)
    const { remainingSeconds } = await getRemainingRoleplayTime(userId, 'Basic');
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
  canStartPracticeSession,
  canStartRoleplaySession,
  canUseLifetimeCall,
  calculateTokenTTL,
};
