const express = require("express");
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth-routes');

// Helper function to get user's subscription details
const getUserSubscription = async (userId) => {
  const client = await db.pool.connect();
  try {
    const result = await client.query(`
      SELECT s.*, sp.plan_type, sp.features, sp.talk_time_minutes, sp.max_scenarios
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
      ORDER BY s.end_date DESC
      LIMIT 1
    `, [userId]);
    
    return result.rows[0] || null;
  } finally {
    client.release();
  }
};

// Helper function to get today's usage
const getTodayUsage = async (userId) => {
  const client = await db.pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await client.query(`
      SELECT * FROM daily_usage 
      WHERE user_id = $1 AND usage_date = $2
    `, [userId, today]);
    
    return result.rows[0] || null;
  } finally {
    client.release();
  }
};

// Helper function to update daily usage
const updateDailyUsage = async (userId, usageType, timeSeconds) => {
  const client = await db.pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get or create today's usage record
    let usage = await getTodayUsage(userId);
    
    if (!usage) {
      await client.query(`
        INSERT INTO daily_usage (user_id, usage_date, ${usageType}_time_seconds, total_time_seconds)
        VALUES ($1, $2, $3, $3)
      `, [userId, today, timeSeconds]);
    } else {
      const newTime = (usage[`${usageType}_time_seconds`] || 0) + timeSeconds;
      const newTotal = (usage.total_time_seconds || 0) + timeSeconds;
      
      await client.query(`
        UPDATE daily_usage 
        SET ${usageType}_time_seconds = $1, total_time_seconds = $2, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $3 AND usage_date = $4
      `, [newTime, newTotal, userId, today]);
    }
  } finally {
    client.release();
  }
};

// Helper function to check if user can use free trial
// User can only use free trial if they have NEVER had a free trial subscription (even if expired)
const canUseFreeTrial = async (userId) => {
  const client = await db.pool.connect();
  try {
    const result = await client.query(`
      SELECT COUNT(*) as trial_count FROM subscriptions 
      WHERE user_id = $1 AND is_free_trial = true
    `, [userId]);
    
    // If user has ever had a free trial (even expired), they cannot use it again
    const hasEverUsedTrial = parseInt(result.rows[0].trial_count) > 0;
    return !hasEverUsedTrial;
  } finally {
    client.release();
  }
};

// Helper function to get lifetime onboarding usage (total seconds)
const getLifetimeOnboardingUsage = async (client, userId) => {
  const lifetimeQuery = `
    SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
    FROM device_speaking_sessions 
    WHERE user_id = $1
  `;
  const lifetimeResult = await client.query(lifetimeQuery, [userId]);
  // PostgreSQL returns numeric as string, convert to number
  return parseInt(lifetimeResult.rows[0]?.total_seconds) || 0;
};

// Helper to mark onboarding call used when lifetime exhausted
const markOnboardingUsed = async (client, userId) => {
  await client.query(
    `UPDATE users 
     SET onboarding_test_call_used = TRUE 
     WHERE id = $1`,
    [userId]
  );
};

// Helper function to start free trial
const startFreeTrial = async (userId) => {
  const client = await db.pool.connect();
  try {
    // Get the free trial plan
    const planResult = await client.query(`
      SELECT id FROM subscription_plans WHERE plan_type = 'FreeTrial' LIMIT 1
    `);
    
    if (planResult.rows.length === 0) {
      throw new Error('Free trial plan not found');
    }
    
    const planId = planResult.rows[0].id;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 7); // 7 days from now
    
    await client.query(`
      INSERT INTO subscriptions (user_id, plan_id, status, start_date, end_date, is_free_trial, free_trial_started_at, free_trial_used)
      VALUES ($1, $2, 'active', $3, $4, true, $3, true)
    `, [userId, planId, startDate, endDate]);

    // Mark onboarding test call as used once free trial starts
    await client.query(
      `
        UPDATE users
        SET onboarding_test_call_used = TRUE
        WHERE id = $1
      `,
      [userId]
    );
    
    return true;
  } finally {
    client.release();
  }
};

// NOTE: Usage start/end session APIs removed.
// Time limits and usage recording are fully handled by the Python agent on call end.

// POST /api/usage/start-free-trial - Start free trial for Basic plan
router.post('/start-free-trial', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`🔄 Backend: Starting free trial for user ${userId}`);
    
    // Check if user can use free trial
    const canTrial = await canUseFreeTrial(userId);
    if (!canTrial) {
      console.log(`❌ Backend: User ${userId} cannot use free trial (already used)`);
      return res.status(403).json({ 
        success: false, 
        error: 'Free trial already used. Please purchase a subscription.' 
      });
    }
    
    console.log(`✅ Backend: User ${userId} can use free trial, starting...`);
    
    // Start free trial
    await startFreeTrial(userId);
    
    console.log(`✅ Backend: Free trial started successfully for user ${userId}`);
    
    res.json({ 
      success: true, 
      message: 'Free trial started successfully',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    
  } catch (error) {
    console.error('❌ Backend: Error starting free trial:', error);
    res.status(500).json({ success: false, error: 'Failed to start free trial' });
  }
});

// GET /api/usage/status - Get current usage status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const subscription = await getUserSubscription(userId);
    const todayUsage = await getTodayUsage(userId);
    
    if (!subscription) {
      return res.json({ 
        success: true, 
        hasSubscription: false,
        canStartFreeTrial: await canUseFreeTrial(userId)
      });
    }
    
    const isFreeTrial = subscription.is_free_trial && 
                       subscription.free_trial_started_at && 
                       new Date() < new Date(subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Calculate daily limits
    let dailyLimitSeconds;
    if (subscription.plan_type === 'FreeTrial' || isFreeTrial) {
      dailyLimitSeconds = 5 * 60; // 5 minutes
    } else if (subscription.plan_type === 'Basic') {
      dailyLimitSeconds = 5 * 60; // 5 minutes
    } else if (subscription.plan_type === 'Pro') {
      dailyLimitSeconds = 60 * 60; // 1 hour
    }
    
    const practiceTime = todayUsage ? (todayUsage.practice_time_seconds || 0) : 0;
    const roleplayTime = todayUsage ? (todayUsage.roleplay_time_seconds || 0) : 0;
    const usedTime = todayUsage ? todayUsage.total_time_seconds : 0;
    const remainingTime = Math.max(0, dailyLimitSeconds - (practiceTime + roleplayTime));
    
    // For Pro users: separate limits for practice and roleplay
    let practiceRemaining = remainingTime;
    let roleplayRemaining = remainingTime;
    if (subscription.plan_type === 'Pro') {
      const practiceLimitSeconds = 5 * 60; // 5 minutes max for practice
      practiceRemaining = Math.max(0, practiceLimitSeconds - practiceTime);
      
      // Roleplay can use remaining time from 60-minute pool
      const roleplayLimitSeconds = dailyLimitSeconds - practiceLimitSeconds; // 55 minutes
      roleplayRemaining = Math.max(0, roleplayLimitSeconds - roleplayTime);
    }
    
    res.json({
      success: true,
      hasSubscription: true,
      subscription: {
        planType: subscription.plan_type,
        isFreeTrial: isFreeTrial,
        trialEndsAt: isFreeTrial ? new Date(subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : null
      },
      usage: {
        dailyLimit: dailyLimitSeconds,
        used: usedTime,
        remaining: remainingTime,
        canUse: remainingTime > 0,
        // For Pro users, include separate practice and roleplay limits
        ...(subscription.plan_type === 'Pro' ? {
          practiceTime: practiceTime,
          practiceRemaining: practiceRemaining,
          roleplayTime: roleplayTime,
          roleplayRemaining: roleplayRemaining,
          practiceLimit: 5 * 60,
          roleplayLimit: 55 * 60
        } : {})
      }
    });
    
  } catch (error) {
    console.error('Error getting usage status:', error);
    res.status(500).json({ success: false, error: 'Failed to get usage status' });
  }
});

// POST /api/usage/check-scenario-limit - Check if user can create scenarios
router.post('/check-scenario-limit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const subscription = await getUserSubscription(userId);
    
    // ✅ Return gracefully for non-subscribed users (don't throw 403)
    if (!subscription) {
      return res.json({ 
        success: true, 
        canCreate: false, 
        limit: 0, 
        used: 0, 
        remaining: 0,
        message: 'No active subscription' 
      });
    }
    
    const isFreeTrial = subscription.is_free_trial && 
                       subscription.free_trial_started_at && 
                       new Date() < new Date(subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Get today's scenario creation count
    const todayUsage = await getTodayUsage(userId);
    const scenariosCreated = todayUsage ? todayUsage.scenarios_created : 0;
    
    // Calculate limits
    let maxScenarios;
    if (subscription.plan_type === 'FreeTrial' || isFreeTrial) {
      maxScenarios = 5; // 5 scenarios for free trial
    } else if (subscription.plan_type === 'Basic') {
      maxScenarios = 5; // 5 scenarios for Basic
    } else if (subscription.plan_type === 'Pro') {
      maxScenarios = -1; // Unlimited for Pro
    } else {
      // ✅ Return gracefully for invalid plans (don't throw 403)
      return res.json({ 
        success: true, 
        canCreate: false, 
        limit: 0, 
        used: 0, 
        remaining: 0,
        message: 'Invalid subscription plan' 
      });
    }
    
    const canCreate = maxScenarios === -1 || scenariosCreated < maxScenarios;
    
    res.json({
      success: true,
      canCreate,
      limit: maxScenarios,
      used: scenariosCreated,
      remaining: maxScenarios === -1 ? -1 : Math.max(0, maxScenarios - scenariosCreated)
    });
    
  } catch (error) {
    console.error('Error checking scenario limit:', error);
    res.status(500).json({ success: false, error: 'Failed to check scenario limit' });
  }
});

// POST /api/usage/record-scenario-creation - Record scenario creation
router.post('/record-scenario-creation', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const client = await db.pool.connect();
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get or create today's usage record
      let usage = await getTodayUsage(userId);
      
      if (!usage) {
        await client.query(`
          INSERT INTO daily_usage (user_id, usage_date, scenarios_created)
          VALUES ($1, $2, 1)
        `, [userId, today]);
      } else {
        await client.query(`
          UPDATE daily_usage 
          SET scenarios_created = scenarios_created + 1, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 AND usage_date = $2
        `, [userId, today]);
      }
      
      res.json({ success: true, message: 'Scenario creation recorded' });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error recording scenario creation:', error);
    res.status(500).json({ success: false, error: 'Failed to record scenario creation' });
  }
});

// POST /api/usage/check-roleplay-limit - Check roleplay session limit for a section
router.post('/check-roleplay-limit', authenticateToken, async (req, res) => {
  try {
    const { sectionName } = req.body;
    const userId = req.user.userId;
    
    if (!sectionName) {
      return res.status(400).json({ success: false, error: 'Section name is required' });
    }
    
    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      return res.status(403).json({ success: false, error: 'No active subscription' });
    }
    
    const isFreeTrial = subscription.is_free_trial && 
                       subscription.free_trial_started_at && 
                       new Date() < new Date(subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Get today's roleplay usage for this section
    const client = await db.pool.connect();
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await client.query(`
        SELECT sessions_completed FROM roleplay_section_usage 
        WHERE user_id = $1 AND section_name = $2 AND usage_date = $3
      `, [userId, sectionName, today]);
      
      const sessionsCompleted = result.rows[0] ? result.rows[0].sessions_completed : 0;
      
      // Calculate limits
      let maxSessions;
      if (subscription.plan_type === 'FreeTrial' || isFreeTrial) {
        maxSessions = 5; // 5 sessions per section for free trial
      } else if (subscription.plan_type === 'Basic') {
        maxSessions = 5; // 5 sessions per section for Basic
      } else if (subscription.plan_type === 'Pro') {
        maxSessions = -1; // Unlimited for Pro
      } else {
        return res.status(403).json({ success: false, error: 'Invalid subscription plan' });
      }
      
      const canPlay = maxSessions === -1 || sessionsCompleted < maxSessions;
      
      res.json({
        success: true,
        canPlay,
        limit: maxSessions,
        used: sessionsCompleted,
        remaining: maxSessions === -1 ? -1 : Math.max(0, maxSessions - sessionsCompleted)
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error checking roleplay limit:', error);
    res.status(500).json({ success: false, error: 'Failed to check roleplay limit' });
  }
});

// POST /api/usage/record-roleplay-session - Record roleplay session completion
router.post('/record-roleplay-session', authenticateToken, async (req, res) => {
  try {
    const { sectionName } = req.body;
    const userId = req.user.userId;
    
    if (!sectionName) {
      return res.status(400).json({ success: false, error: 'Section name is required' });
    }
    
    const client = await db.pool.connect();
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get or create today's roleplay usage for this section
      const existing = await client.query(`
        SELECT sessions_completed FROM roleplay_section_usage 
        WHERE user_id = $1 AND section_name = $2 AND usage_date = $3
      `, [userId, sectionName, today]);
      
      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO roleplay_section_usage (user_id, section_name, sessions_completed, usage_date)
          VALUES ($1, $2, 1, $3)
        `, [userId, sectionName, today]);
      } else {
        await client.query(`
          UPDATE roleplay_section_usage 
          SET sessions_completed = sessions_completed + 1, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 AND section_name = $2 AND usage_date = $3
        `, [userId, sectionName, today]);
      }
      
      res.json({ success: true, message: 'Roleplay session recorded' });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error recording roleplay session:', error);
    res.status(500).json({ success: false, error: 'Failed to record roleplay session' });
  }
});

// GET /api/usage/remaining-time - Get remaining daily time for calls/practice/roleplay
router.get('/remaining-time', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    // Optional query parameters for active session tracking
    const currentSessionDurationSeconds = parseInt(req.query.currentSessionDurationSeconds) || 0;
    const sessionType = req.query.sessionType || 'practice'; // 'practice', 'roleplay', or 'test'
    
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      // Onboarding lifetime logic for users without subscription
      const client = await db.pool.connect();
      try {
        const result = await client.query(`
          SELECT onboarding_test_call_used FROM users 
          WHERE id = $1
        `, [userId]);
        
        const user = result.rows[0];
        const hasUsedOnboardingCall = user?.onboarding_test_call_used || false;

        const lifetimeSeconds = await getLifetimeOnboardingUsage(client, userId);
        const onboardingLimitSeconds = 5 * 60;
        
        // Check if there's a very recent session (within last 30 seconds) to prevent double-counting
        // This handles the race condition where the session was just saved but time check still runs
        const recentSessionQuery = await client.query(`
          SELECT duration_seconds, created_at
          FROM device_speaking_sessions 
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [userId]);
        
        const recentSession = recentSessionQuery.rows[0];
        const now = new Date();
        const sessionAge = recentSession ? (now - new Date(recentSession.created_at)) / 1000 : Infinity;
        
        // If session was saved within last 30 seconds AND its duration is close to currentSessionDurationSeconds,
        // don't add currentSessionDurationSeconds again (already counted in lifetimeSeconds)
        let effectiveCurrentDuration = parseInt(currentSessionDurationSeconds) || 0;
        if (sessionAge < 30 && recentSession && 
            Math.abs(parseInt(recentSession.duration_seconds) - effectiveCurrentDuration) < 15) {
          console.log(`⚠️  Preventing double-count: Recent session (${sessionAge.toFixed(1)}s ago) already includes current duration`);
          effectiveCurrentDuration = 0; // Don't double-count
        }
        
        // Account for current session duration (same logic as Python agent)
        // Ensure all values are numbers before calculation
        const totalWouldBe = parseInt(lifetimeSeconds) + parseInt(effectiveCurrentDuration);
        const remainingLifetimeSeconds = Math.max(0, onboardingLimitSeconds - totalWouldBe);
        
        console.log(`📊 Time calculation: lifetime=${lifetimeSeconds}, current=${effectiveCurrentDuration}, total=${totalWouldBe}, remaining=${remainingLifetimeSeconds}`);
        
        if (remainingLifetimeSeconds <= 0) {
          if (!hasUsedOnboardingCall) {
            await markOnboardingUsed(client, userId);
          }
          return res.json({ 
            success: true, 
            hasSubscription: false,
            remainingTimeSeconds: 0,
            dailyLimitSeconds: 0,
            canStartCall: false,
            lifetimeUsedSeconds: lifetimeSeconds,
            currentSessionDuration: effectiveCurrentDuration,
            remainingLifetimeSeconds: 0,
            message: 'Onboarding test call lifetime limit reached. Please subscribe for more calls.'
          });
        }
        
        // If flag is out of sync but time remains, clear it
        if (hasUsedOnboardingCall && remainingLifetimeSeconds > 0) {
          await client.query(
            `UPDATE users SET onboarding_test_call_used = FALSE WHERE id = $1`,
            [userId]
          );
        }
        
        // Allow onboarding call with remaining lifetime time
        return res.json({ 
          success: true, 
          hasSubscription: false,
          remainingTimeSeconds: remainingLifetimeSeconds,
          dailyLimitSeconds: onboardingLimitSeconds,
          canStartCall: true,
          isOnboardingCall: true,
          lifetimeUsedSeconds: lifetimeSeconds,
          currentSessionDuration: effectiveCurrentDuration,
          remainingLifetimeSeconds,
          message: 'Onboarding test call available'
        });
      } finally {
        client.release();
      }
    }
    
    const isFreeTrial = subscription.is_free_trial && 
                       subscription.free_trial_started_at && 
                       new Date() < new Date(subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Calculate daily limits based on plan
    let dailyLimitSeconds;
    if (subscription.plan_type === 'FreeTrial' || isFreeTrial) {
      dailyLimitSeconds = 5 * 60; // 5 minutes
    } else if (subscription.plan_type === 'Basic') {
      dailyLimitSeconds = 5 * 60; // 5 minutes
    } else if (subscription.plan_type === 'Pro') {
      dailyLimitSeconds = 60 * 60; // 1 hour
    } else {
      dailyLimitSeconds = 0; // No access
    }
    
    // Get today's usage
    const todayUsage = await getTodayUsage(userId);
    const practiceTimeSeconds = todayUsage ? (todayUsage.practice_time_seconds || 0) : 0;
    const roleplayTimeSeconds = todayUsage ? (todayUsage.roleplay_time_seconds || 0) : 0;
    const callTimeSeconds = todayUsage ? (todayUsage.call_time_seconds || 0) : 0;
    const usedTimeSeconds = practiceTimeSeconds + roleplayTimeSeconds + callTimeSeconds;
    
    // For Pro users: separate limits for practice (5 min max) and roleplay (remaining from 60 min pool)
    let remainingTimeSeconds;
    let practiceRemainingSeconds;
    let roleplayRemainingSeconds;
    
    if (subscription.plan_type === 'Pro') {
      const practiceLimitSeconds = 5 * 60; // 5 minutes max for practice
      // Account for current session if it's a practice session
      const practiceUsedWithSession = practiceTimeSeconds + (sessionType === 'practice' ? currentSessionDurationSeconds : 0);
      practiceRemainingSeconds = Math.max(0, practiceLimitSeconds - practiceUsedWithSession);
      
      // Roleplay can use remaining time from 60-minute pool (after subtracting practice time)
      const roleplayLimitSeconds = dailyLimitSeconds - practiceLimitSeconds; // 55 minutes
      const roleplayUsedWithSession = roleplayTimeSeconds + (sessionType === 'roleplay' ? currentSessionDurationSeconds : 0);
      roleplayRemainingSeconds = Math.max(0, roleplayLimitSeconds - roleplayUsedWithSession);
      
      // Total remaining is for overall limit (accounting for current session)
      const totalUsedWithSession = practiceTimeSeconds + roleplayTimeSeconds + currentSessionDurationSeconds;
      remainingTimeSeconds = Math.max(0, dailyLimitSeconds - totalUsedWithSession);
    } else {
      // Basic/FreeTrial: combined limit (practice + roleplay share 5 minutes)
      // Account for current session duration (same logic as Python agent)
      const totalUsedWithSession = practiceTimeSeconds + roleplayTimeSeconds + currentSessionDurationSeconds;
      remainingTimeSeconds = Math.max(0, dailyLimitSeconds - totalUsedWithSession);
      practiceRemainingSeconds = remainingTimeSeconds;
      roleplayRemainingSeconds = remainingTimeSeconds;
    }
    
    const canStartCall = remainingTimeSeconds > 0;
    
    res.json({
      success: true,
      hasSubscription: true,
      planType: subscription.plan_type,
      isFreeTrial: isFreeTrial,
      remainingTimeSeconds: remainingTimeSeconds,
      usedTimeSeconds: usedTimeSeconds,
      dailyLimitSeconds: dailyLimitSeconds,
      canStartCall: canStartCall,
      remainingTimeFormatted: formatTime(remainingTimeSeconds),
      usedTimeFormatted: formatTime(usedTimeSeconds),
      dailyLimitFormatted: formatTime(dailyLimitSeconds),
      // For Pro users, include separate practice and roleplay limits
      ...(subscription.plan_type === 'Pro' ? {
        practiceTimeSeconds: practiceTimeSeconds,
        practiceRemainingSeconds: practiceRemainingSeconds,
        roleplayTimeSeconds: roleplayTimeSeconds,
        roleplayRemainingSeconds: roleplayRemainingSeconds,
        practiceLimitSeconds: 5 * 60,
        roleplayLimitSeconds: 55 * 60
      } : {})
    });
    
  } catch (error) {
    console.error('Error getting remaining time:', error);
    res.status(500).json({ success: false, error: 'Failed to get remaining time' });
  }
});

// GET /api/usage/today-timeline - consolidated timeline status & remaining time
router.get('/today-timeline', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const today = new Date().toISOString().split('T')[0];

  let client;
  try {
    client = await db.pool.connect();

    // Subscription determines caps; no subscription => zero remaining
    const subscription = await getUserSubscription(userId);
    const isFreeTrial =
      subscription &&
      subscription.is_free_trial &&
      subscription.free_trial_started_at &&
      new Date() <
        new Date(
          subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000
        );

    const practiceCap = 5 * 60;
    let roleplayCap = 0;
    if (subscription) {
      if (subscription.plan_type === 'Pro') {
        roleplayCap = 55 * 60;
      } else if (
        subscription.plan_type === 'Basic' ||
        subscription.plan_type === 'FreeTrial' ||
        isFreeTrial
      ) {
        roleplayCap = 5 * 60;
      }
    }

    // Usage totals
    const todayUsage = await getTodayUsage(userId);
    const practiceUsed = todayUsage ? todayUsage.practice_time_seconds || 0 : 0;
    const roleplayUsed = todayUsage ? todayUsage.roleplay_time_seconds || 0 : 0;

    const practiceRemaining =
      subscription && roleplayCap >= 0 ? Math.max(0, practiceCap - practiceUsed) : 0;
    const roleplayRemaining =
      subscription && roleplayCap > 0
        ? Math.max(0, roleplayCap - roleplayUsed)
        : 0;

    // Lifetime call usage: 5-minute lifetime limit for all users
    const lifetimeResult = await client.query(
      `SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
       FROM lifetime_call_usage
       WHERE user_id = $1`,
      [userId]
    );
    const lifetimeUsedSeconds = parseInt(
      lifetimeResult.rows[0]?.total_seconds || 0,
      10
    );
    const callLimitSeconds = 5 * 60;
    const callRemainingSeconds = Math.max(
      0,
      callLimitSeconds - lifetimeUsedSeconds
    );

    // Progress flags for today
    const progressResult = await client.query(
      `SELECT roleplay_completed, quiz_completed, listening_completed, listening_quiz_completed
       FROM daily_progress WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );
    const progress = progressResult.rows[0] || {};

    res.json({
      success: true,
      data: {
        isPracticeCompleted: practiceRemaining === 0,
        practiceSessionTimeRemaining: practiceRemaining,
        roleplaySessionTimeRemaining: roleplayRemaining,
        roleplayFinished: progress.roleplay_completed || false,
        quizCompleted: progress.quiz_completed || false,
        listeningCompleted: progress.listening_completed || false,
        listeningQuizCompleted: progress.listening_quiz_completed || false,
        todaysReportCompleted: false,
        // Call remaining time (lifetime 5 minutes)
        callRemainingSeconds,
      },
    });
  } catch (error) {
    console.error('Error getting today timeline:', error);
    res
      .status(500)
      .json({ success: false, error: 'Failed to get today timeline' });
  } finally {
    if (client) client.release();
  }
});

// POST /api/usage/today-timeline - update completion flags for today
router.post('/today-timeline', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const {
    roleplayFinished,
    quizCompleted,
    listeningCompleted,
    listeningQuizCompleted,
  } = req.body;

  if (
    roleplayFinished === undefined &&
    quizCompleted === undefined &&
    listeningCompleted === undefined &&
    listeningQuizCompleted === undefined
  ) {
    return res.status(400).json({
      success: false,
      error: 'At least one flag must be provided',
    });
  }

  let client;
  try {
    client = await db.pool.connect();

    // Active course required to upsert daily_progress
    const courseResult = await client.query(
      'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    if (courseResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'No active course found' });
    }
    const course = courseResult.rows[0];

    const courseStart = new Date(course.course_start_date);
    const daysSinceStart = Math.floor(
      (new Date() - courseStart) / (1000 * 60 * 60 * 24)
    );
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    const currentDay = (daysSinceStart % 7) + 1;
    const today = new Date().toISOString().split('T')[0];

    // Check if a row exists for today
    const existingProgress = await client.query(
      'SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (existingProgress.rows.length === 0) {
      await client.query(
        `INSERT INTO daily_progress (
            user_id, course_id, week_number, day_number, date,
            roleplay_completed, quiz_completed, listening_completed, listening_quiz_completed
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          course.id,
          currentWeek,
          currentDay,
          today,
          roleplayFinished || false,
          quizCompleted || false,
          listeningCompleted || false,
          listeningQuizCompleted || false,
        ]
      );
    } else {
      // Update only provided flags
      await client.query(
        `UPDATE daily_progress
         SET
           roleplay_completed = COALESCE($1, roleplay_completed),
           quiz_completed = COALESCE($2, quiz_completed),
           listening_completed = COALESCE($3, listening_completed),
           listening_quiz_completed = COALESCE($4, listening_quiz_completed),
           updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $5 AND date = $6`,
        [
          roleplayFinished,
          quizCompleted,
          listeningCompleted,
          listeningQuizCompleted,
          userId,
          today,
        ]
      );
    }

    res.json({ success: true, message: 'Timeline updated' });
  } catch (error) {
    console.error('Error updating timeline flags:', error);
    res
      .status(500)
      .json({ success: false, error: 'Failed to update timeline' });
  } finally {
    if (client) client.release();
  }
});

// Helper function to format seconds into readable time
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

module.exports = router;
