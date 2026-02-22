// Centralized time-limit utility for practice/roleplay

/**
 * Get daily pool limit seconds based on plan
 * NOTE: Deprecated - now using per-session-type caps instead of shared pool
 */
function getDailyPoolLimitSeconds(planType, isFreeTrial) {
  if (planType === 'FreeTrial' || isFreeTrial) return 10 * 60; // 5 + 5 practice and roleplay
  if (planType === 'Basic') return 10 * 60; // 5 + 5 practice and roleplay
  if (planType === 'Pro') return 20 * 60; // 10 + 10 practice and roleplay
  return 0;
}

/**
 * Get max practice seconds for the day based on plan
 * - Basic/FreeTrial: 5 minutes per day
 * - Pro: 10 minutes per day (independent from roleplay)
 */
function getPracticeCapSeconds(planType, isFreeTrial) {
  if (planType === 'FreeTrial' || isFreeTrial || planType === 'Basic') return 5 * 60;
  if (planType === 'Pro') return 10 * 60;
  return 0;
}

/**
 * Get max roleplay seconds for the day based on plan
 * - Basic/FreeTrial: 5 minutes per day (independent from practice)
 * - Pro: 10 minutes per day (independent from practice)
 */
function getRoleplayCapSeconds(planType, isFreeTrial) {
  if (planType === 'FreeTrial' || isFreeTrial || planType === 'Basic') return 5 * 60;
  if (planType === 'Pro') return 10 * 60;
  return 0;
}

/**
 * Compute remaining seconds for a session type given today's usage
 * todayUsage: { practice_time_seconds, roleplay_time_seconds, total_time_seconds }
 * 
 * NOTE: Practice and roleplay now have INDEPENDENT daily caps:
 * - Basic/FreeTrial: 5 min practice + 5 min roleplay (separate daily caps)
 * - Pro: 10 min practice + 10 min roleplay (separate daily caps)
 */
function computeRemainingForSession(planType, isFreeTrial, sessionType, todayUsage) {
  const practiceUsed = todayUsage ? (todayUsage.practice_time_seconds || 0) : 0;
  const roleplayUsed = todayUsage ? (todayUsage.roleplay_time_seconds || 0) : 0;

  if (sessionType === 'practice') {
    const practiceCap = getPracticeCapSeconds(planType, isFreeTrial);
    const remainingPractice = Math.max(0, practiceCap - practiceUsed);
    return remainingPractice;
  }

  if (sessionType === 'roleplay') {
    const roleplayCap = getRoleplayCapSeconds(planType, isFreeTrial);
    const remainingRoleplay = Math.max(0, roleplayCap - roleplayUsed);
    return remainingRoleplay;
  }

  // Default: use remaining pool (for backward compatibility)
  const dailyPool = getDailyPoolLimitSeconds(planType, isFreeTrial);
  const poolUsed = practiceUsed + roleplayUsed;
  return Math.max(0, dailyPool - poolUsed);
}

module.exports = {
  getDailyPoolLimitSeconds,
  getPracticeCapSeconds,
  getRoleplayCapSeconds,
  computeRemainingForSession,
};


