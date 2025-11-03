// Centralized time-limit utility for practice/roleplay

/**
 * Get daily pool limit seconds based on plan
 */
function getDailyPoolLimitSeconds(planType, isFreeTrial) {
  if (planType === 'FreeTrial' || isFreeTrial) return 5 * 60;
  if (planType === 'Basic') return 5 * 60;
  if (planType === 'Pro') return 60 * 60;
  return 0;
}

/**
 * Get max practice seconds for the day based on plan
 * - Practice is always capped at 5 minutes for both Basic and Pro (and FreeTrial)
 */
function getPracticeCapSeconds(planType) {
  return 5 * 60;
}

/**
 * Get max roleplay seconds for the day based on plan
 * - For Basic/FreeTrial: roleplay shares the 5-minute daily pool with practice
 * - For Pro: roleplay can use (60 - 5) minutes = 55 minutes
 */
function getRoleplayCapSeconds(planType, isFreeTrial) {
  if (planType === 'FreeTrial' || planType === 'Basic' || isFreeTrial) return 5 * 60;
  if (planType === 'Pro') return 55 * 60;
  return 0;
}

/**
 * Compute remaining seconds for a session type given today's usage
 * todayUsage: { practice_time_seconds, roleplay_time_seconds, total_time_seconds }
 */
function computeRemainingForSession(planType, isFreeTrial, sessionType, todayUsage) {
  const practiceUsed = todayUsage ? (todayUsage.practice_time_seconds || 0) : 0;
  const roleplayUsed = todayUsage ? (todayUsage.roleplay_time_seconds || 0) : 0;

  const dailyPool = getDailyPoolLimitSeconds(planType, isFreeTrial);
  const poolUsed = practiceUsed + roleplayUsed;

  if (sessionType === 'practice') {
    const practiceCap = getPracticeCapSeconds(planType);
    const remainingPractice = Math.max(0, practiceCap - practiceUsed);
    const remainingPool = Math.max(0, dailyPool - poolUsed);
    // Practice constrained by both practice cap and pool
    return Math.min(remainingPractice, remainingPool);
  }

  if (sessionType === 'roleplay') {
    const roleplayCap = getRoleplayCapSeconds(planType, isFreeTrial);
    let roleplayRemainingCap = Math.max(0, roleplayCap - roleplayUsed);
    // For Basic/FreeTrial, roleplay shares daily pool
    const remainingPool = Math.max(0, dailyPool - poolUsed);
    return Math.min(roleplayRemainingCap, remainingPool);
  }

  // Default: use remaining pool
  return Math.max(0, dailyPool - poolUsed);
}

module.exports = {
  getDailyPoolLimitSeconds,
  getPracticeCapSeconds,
  getRoleplayCapSeconds,
  computeRemainingForSession,
};


