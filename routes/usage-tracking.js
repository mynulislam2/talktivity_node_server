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
const canUseFreeTrial = async (userId) => {
  const client = await db.pool.connect();
  try {
    const result = await client.query(`
      SELECT COUNT(*) as trial_count FROM subscriptions 
      WHERE user_id = $1 AND is_free_trial = true
    `, [userId]);
    
    return parseInt(result.rows[0].trial_count) === 0;
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
  return lifetimeResult.rows[0]?.total_seconds || 0;
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

// POST /api/usage/start-session - Start a usage session (call/practice/roleplay)
router.post('/start-session', authenticateToken, async (req, res) => {
  try {
    const { sessionType } = req.body; // 'call', 'practice', 'roleplay'
    const userId = req.user.userId;
    
    if (!['call', 'practice', 'roleplay'].includes(sessionType)) {
      return res.status(400).json({ success: false, error: 'Invalid session type' });
    }
    
    const subscription = await getUserSubscription(userId);
    if (!subscription) {
      // Check if user can use onboarding test call (lifetime 5 minutes across sessions)
      const client = await db.pool.connect();
      try {
        const result = await client.query(`
          SELECT onboarding_test_call_used FROM users 
          WHERE id = $1
        `, [userId]);
        
        const user = result.rows[0];
        const hasUsedOnboardingCall = user?.onboarding_test_call_used || false;
        
        // Compute lifetime usage
        const lifetimeSeconds = await getLifetimeOnboardingUsage(client, userId);
        const onboardingLimitSeconds = 5 * 60;
        const remainingLifetimeSeconds = Math.max(0, onboardingLimitSeconds - lifetimeSeconds);

        // Source of truth is lifetime seconds; only block when none remain
        if (remainingLifetimeSeconds <= 0) {
          return res.status(403).json({ 
            success: false, 
            error: 'Onboarding test call lifetime limit reached. Please subscribe for more calls.',
            lifetimeLimitReached: true,
            lifetimeUsedSeconds: lifetimeSeconds,
            remainingLifetimeSeconds: 0
          });
        }
        
        // If flag is out of sync but time remains, clear it
        if (hasUsedOnboardingCall && remainingLifetimeSeconds > 0) {
          await client.query(
            `UPDATE users SET onboarding_test_call_used = FALSE WHERE id = $1`,
            [userId]
          );
        }
        
        // Don't mark as used yet - only mark when session actually ends
        // Return session ID for onboarding call and remaining lifetime info
        const sessionId = `onboarding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return res.json({ 
          success: true, 
          sessionId,
          message: 'Onboarding test call started',
          isOnboardingCall: true,
          lifetimeLimitSeconds: onboardingLimitSeconds,
          lifetimeUsedSeconds: lifetimeSeconds,
          remainingLifetimeSeconds
        });
        
      } finally {
        client.release();
      }
    }
    
    // Check if user is in free trial period
    const isFreeTrial = subscription.is_free_trial && 
                       subscription.free_trial_started_at && 
                       new Date() < new Date(subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000);
    
  // Centralized limits
  const { computeRemainingForSession, getDailyPoolLimitSeconds } = require('../utils/timeLimits');
  const todayUsage = await getTodayUsage(userId);
  const dailyLimitSeconds = getDailyPoolLimitSeconds(subscription.plan_type, isFreeTrial);
  if (!dailyLimitSeconds)
    return res.status(403).json({ success: false, error: 'Invalid subscription plan' });

  const remainingForSession = computeRemainingForSession(
    subscription.plan_type,
    isFreeTrial,
    sessionType,
    todayUsage
  );

  if (remainingForSession <= 0) {
    const planText = subscription.plan_type === 'Pro' && sessionType === 'practice'
      ? 'Practice session limit reached (5 minutes).'
      : 'Daily usage limit exceeded.';
    return res.status(429).json({ 
      success: false,
      error: planText,
      limit: dailyLimitSeconds,
      used: (todayUsage?.practice_time_seconds || 0) + (todayUsage?.roleplay_time_seconds || 0),
      remaining: 0
    });
  }
    
    // Generate session ID for tracking
    const sessionId = `session_${userId}_${Date.now()}`;
    
    res.json({ 
      success: true, 
      sessionId,
      dailyLimit: dailyLimitSeconds,
      used: (todayUsage?.practice_time_seconds || 0) + (todayUsage?.roleplay_time_seconds || 0),
      remaining: dailyLimitSeconds - ((todayUsage?.practice_time_seconds || 0) + (todayUsage?.roleplay_time_seconds || 0))
    });
    
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ success: false, error: 'Failed to start session' });
  }
});

// POST /api/usage/end-session - End a usage session and record time
router.post('/end-session', authenticateToken, async (req, res) => {
  try {
    const { sessionId, sessionType, durationSeconds } = req.body;
    const userId = req.user.userId;
    
    if (!sessionId || !sessionType || !durationSeconds) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Check if this is an onboarding call
    const isOnboardingCall = sessionId.startsWith('onboarding_');
    
    if (isOnboardingCall) {
      // For onboarding calls, track lifetime usage
      const client = await db.pool.connect();
      try {
        // Record session duration in device_speaking_sessions
        const now = new Date();
        const sessionDate = now.toISOString().split('T')[0];
        await client.query(
          `INSERT INTO device_speaking_sessions (user_id, date, start_time, end_time, duration_seconds)
           VALUES ($1, $2, $3, $3, $4)`,
          [userId, sessionDate, now, durationSeconds]
        );

        const lifetimeSeconds = await getLifetimeOnboardingUsage(client, userId);
        const onboardingLimitSeconds = 5 * 60;
        const remainingLifetimeSeconds = Math.max(0, onboardingLimitSeconds - lifetimeSeconds);

        if (remainingLifetimeSeconds <= 0) {
          await markOnboardingUsed(client, userId);
        } else if (lifetimeSeconds >= onboardingLimitSeconds) {
          await markOnboardingUsed(client, userId);
        }

        return res.json({ 
          success: true, 
          message: 'Onboarding test call ended',
          isOnboardingCall: true,
          lifetimeLimitReached: remainingLifetimeSeconds <= 0,
          lifetimeUsedSeconds: lifetimeSeconds,
          remainingLifetimeSeconds
        });
      } finally {
        client.release();
      }
    }
    
    // For regular sessions, update daily usage
    await updateDailyUsage(userId, sessionType, durationSeconds);
    
    res.json({ success: true, message: 'Session ended and usage recorded' });
    
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ success: false, error: 'Failed to end session' });
  }
});

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
    
    if (!subscription) {
      return res.status(403).json({ success: false, error: 'No active subscription' });
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
      return res.status(403).json({ success: false, error: 'Invalid subscription plan' });
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
        const remainingLifetimeSeconds = Math.max(0, onboardingLimitSeconds - lifetimeSeconds);
        
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
      practiceRemainingSeconds = Math.max(0, practiceLimitSeconds - practiceTimeSeconds);
      
      // Roleplay can use remaining time from 60-minute pool (after subtracting practice time)
      const roleplayLimitSeconds = dailyLimitSeconds - practiceLimitSeconds; // 55 minutes
      roleplayRemainingSeconds = Math.max(0, roleplayLimitSeconds - roleplayTimeSeconds);
      
      // Total remaining is for overall limit
      remainingTimeSeconds = Math.max(0, dailyLimitSeconds - (practiceTimeSeconds + roleplayTimeSeconds));
    } else {
      // Basic/FreeTrial: combined limit (practice + roleplay share 5 minutes)
      remainingTimeSeconds = Math.max(0, dailyLimitSeconds - (practiceTimeSeconds + roleplayTimeSeconds));
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
