const express = require("express");
const router = express.Router();
const { authenticateToken } = require("./auth-routes");
const db = require("../db");

/**
 * GET /api/user/progress
 * Returns all user progress states in a single response
 * - Onboarding completion status and data
 * - Call completion (has any speaking sessions)
 * - Report completion status
 * - Subscription status
 * - Conversation experience
 */
router.get("/progress", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const client = await db.pool.connect();
    try {
      // 1. Get onboarding data
      const onboardingQuery = `
        SELECT * FROM onboarding_data 
        WHERE user_id = $1
      `;
      const onboardingResult = await client.query(onboardingQuery, [userId]);
      const onboardingData = onboardingResult.rows[0];

      // Validate all 15 required onboarding fields (matching onboarding-routes.js)
      const requiredFields = [
        'skill_to_improve', 'language_statement', 'industry', 'speaking_feelings',
        'speaking_frequency', 'main_goal', 'gender', 'current_learning_methods',
        'current_level', 'native_language', 'known_words_1', 'known_words_2',
        'interests', 'english_style', 'tutor_style'
      ];

      const isOnboardingComplete = onboardingData && requiredFields.every(field => {
        const value = onboardingData[field];
        // For array/JSONB fields, check if they have at least one item
        if (Array.isArray(value) || (value && typeof value === 'object')) {
          return Array.isArray(value) ? value.length > 0 : true;
        }
        // For string/number fields, check if they exist and are not null
        return value !== null && value !== undefined && value !== '';
      });

      // Convert onboarding data to array format for each step
      const onboardingSteps = onboardingData ? [
        { step: 1, completed: !!onboardingData.skill_to_improve, data: { skillToImprove: onboardingData.skill_to_improve } },
        { step: 2, completed: !!onboardingData.language_statement, data: { languageStatement: onboardingData.language_statement } },
        { step: 3, completed: !!onboardingData.industry, data: { industry: onboardingData.industry } },
        { step: 4, completed: !!onboardingData.speaking_feelings, data: { speakingFeelings: onboardingData.speaking_feelings } },
        { step: 5, completed: !!onboardingData.speaking_frequency, data: { speakingFrequency: onboardingData.speaking_frequency } },
        { step: 6, completed: !!onboardingData.main_goal, data: { mainGoal: onboardingData.main_goal } },
        { step: 7, completed: !!onboardingData.gender, data: { gender: onboardingData.gender } },
        { step: 8, completed: Array.isArray(onboardingData.current_learning_methods) && onboardingData.current_learning_methods.length > 0, data: { currentLearningMethods: onboardingData.current_learning_methods } },
        { step: 9, completed: !!onboardingData.current_level, data: { currentLevel: onboardingData.current_level } },
        { step: 10, completed: !!onboardingData.native_language, data: { nativeLanguage: onboardingData.native_language } },
        { step: 11, completed: Array.isArray(onboardingData.known_words_1) && onboardingData.known_words_1.length > 0, data: { knownWords1: onboardingData.known_words_1 } },
        { step: 12, completed: Array.isArray(onboardingData.known_words_2) && onboardingData.known_words_2.length > 0, data: { knownWords2: onboardingData.known_words_2 } },
        { step: 13, completed: Array.isArray(onboardingData.interests) && onboardingData.interests.length > 0, data: { interests: onboardingData.interests } },
        { step: 14, completed: !!onboardingData.english_style, data: { englishStyle: onboardingData.english_style } },
        { step: 15, completed: Array.isArray(onboardingData.tutor_style) && onboardingData.tutor_style.length > 0, data: { tutorStyle: onboardingData.tutor_style } }
      ] : [];

      // 2. Check if user has completed any speaking session (call completed)
      const sessionQuery = `
        SELECT COUNT(*) as session_count
        FROM device_speaking_sessions 
        WHERE user_id = $1 AND duration_seconds > 0
      `;
      const sessionResult = await client.query(sessionQuery, [userId]);
      const hasCompletedCall = parseInt(sessionResult.rows[0]?.session_count || 0) > 0;

      // 3. Check if user has viewed report
      const reportQuery = `
        SELECT report_completed FROM users 
        WHERE id = $1
      `;
      const reportResult = await client.query(reportQuery, [userId]);
      const hasViewedReport = reportResult.rows[0]?.report_completed || false;

      // 4. Check subscription status (match getUserSubscription logic from usage-tracking.js exactly)
      const subscriptionQuery = `
        SELECT 
          s.status,
          s.is_free_trial,
          s.free_trial_started_at,
          s.start_date,
          s.end_date,
          sp.plan_type
        FROM subscriptions s
        JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
        ORDER BY s.end_date DESC
        LIMIT 1
      `;
      const subscriptionResult = await client.query(subscriptionQuery, [userId]);
      const subscription = subscriptionResult.rows[0];

      const isFreeTrial = subscription?.is_free_trial && 
                         subscription?.free_trial_started_at && 
                         new Date() < new Date(subscription.free_trial_started_at.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const hasActiveSubscription = subscription && (
        (subscription.status === 'active') ||
        (subscription.status === 'trialing') ||
        isFreeTrial
      );
      
      // Log subscription detection for debugging
      if (subscription) {
        console.log(`📊 Progress API: Found subscription for user ${userId}`, {
          status: subscription.status,
          planType: subscription.plan_type,
          isFreeTrial: isFreeTrial,
          endDate: subscription.end_date,
          hasActiveSubscription: hasActiveSubscription
        });
      } else {
        console.log(`📊 Progress API: No active subscription found for user ${userId}`);
      }

      // 5. Check conversation experience (has any conversations)
      const conversationQuery = `
        SELECT COUNT(*) as conversation_count
        FROM conversations 
        WHERE user_id = $1
      `;
      const conversationResult = await client.query(conversationQuery, [userId]);
      const hasConversationExperience = parseInt(conversationResult.rows[0]?.conversation_count || 0) > 0;

      // Return unified progress data
      return res.json({
        success: true,
        data: {
          onboarding: {
            completed: isOnboardingComplete,
            steps: onboardingSteps,
            totalSteps: 15,
            completedSteps: onboardingSteps.filter(s => s.completed).length
          },
          call: {
            completed: hasCompletedCall
          },
          report: {
            completed: hasViewedReport
          },
          subscription: {
            active: hasActiveSubscription,
            planType: subscription?.plan_type || null,
            isFreeTrial: isFreeTrial,
            status: subscription?.status || null
          },
          conversation: {
            hasExperience: hasConversationExperience
          }
        }
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching user progress:", error);
    console.error("Error stack:", error.stack);
    console.error("Error message:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch user progress",
      details: error.message
    });
  }
});

/**
 * POST /api/user/progress/update
 * Update specific progress flags
 */
router.post("/progress/update", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reportCompleted } = req.body;

    const client = await db.pool.connect();
    try {
      // Update report viewed status if provided
      if (reportCompleted !== undefined) {
        await client.query(
          `UPDATE users SET report_completed = $1 WHERE id = $2`,
          [reportCompleted, userId]
        );
      }

      return res.json({
        success: true,
        message: "Progress updated successfully"
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error updating user progress:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update user progress"
    });
  }
});

module.exports = router;

