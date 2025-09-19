// src/modules/listening/service.js
// Listening business logic

const db = require('../../core/db/client');
const listeningTopics = require('../../../listening-topics.js');

const fetchListeningTopics = async () => {
  try {
    // Return the listening topics data
    return listeningTopics;
  } catch (error) {
    console.error('Error fetching listening topics:', error);
    throw new Error('Failed to fetch listening topics');
  }
};

// Get current course status and today's progress
const fetchCourseStatus = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();

    const today = new Date().toISOString().split("T")[0];

    // Get user's active course
    const courseResult = await client.query(
      "SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true",
      [userId]
    );

    if (courseResult.rows.length === 0) {
      throw new Error("No active course found");
    }

    const course = courseResult.rows[0];

    // Get today's progress
    const progressResult = await client.query(
      "SELECT * FROM daily_progress WHERE user_id = $1 AND date = $2",
      [userId, today]
    );

    const todayProgress = progressResult.rows[0] || null;

    // Calculate current week and day
    const courseStart = new Date(course.course_start_date);
    const daysSinceStart = Math.floor(
      (new Date() - courseStart) / (1000 * 60 * 60 * 24)
    );
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    const currentDay = (daysSinceStart % 7) + 1;

    // Sum all speaking session durations for today
    const sumResult = await client.query(
      "SELECT COALESCE(SUM(duration_seconds),0) as total_seconds FROM speaking_sessions WHERE user_id = $1 AND date = $2",
      [userId, today]
    );
    const totalSeconds = parseInt(sumResult.rows[0].total_seconds, 10);
    const maxSeconds = 5 * 60;
    const timeRemaining = Math.max(0, maxSeconds - totalSeconds);
    
    // Determine what's available today
    const dayType = getDayType(currentDay);

    // speakingAvailable: true if timeRemaining > 0 and not marked completed
    const speakingAvailable =
      timeRemaining > 0 && !(todayProgress && todayProgress.speaking_completed);

    // Get today's personalized topic
    let todayTopic = null;
    if (course.personalized_topics && course.personalized_topics.length > 0) {
      const dayIndex = (currentWeek - 1) * 7 + (currentDay - 1);
      if (dayIndex < course.personalized_topics.length) {
        todayTopic = course.personalized_topics[dayIndex];
      }
    }

    // Get today's listening topic from the imported listening topics
    let todayListeningTopic = null;
    // Use the imported listening topics array for better variety
    const topicIndex = (currentDay - 1) % listeningTopics.length;
    todayListeningTopic = listeningTopics[topicIndex];

    return {
      course: {
        id: course.id,
        currentWeek: currentWeek,
        currentDay: currentDay,
        dayType: dayType,
        totalWeeks: 12,
        totalDays: 84,
        batchNumber: course.batch_number || 1,
      },
      progress: {
        today: todayProgress,
        speakingAvailable: speakingAvailable,
        timeRemaining: timeRemaining,
        maxTime: maxSeconds,
      },
      topics: {
        speaking: todayTopic,
        listening: todayListeningTopic,
      }
    };
  } finally {
    if (client) client.release();
  }
};

// Helper function to determine day type
const getDayType = (day) => {
  switch (day) {
    case 1:
    case 3:
    case 5:
      return "speaking";
    case 2:
    case 4:
      return "listening";
    case 6:
      return "quiz";
    case 7:
      return "exam";
    default:
      return "speaking";
  }
};

// Initialize course for a new user (3 months = 12 weeks)
const initializeCourse = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();

    // Check if user already has an active course with personalized topics
    const existingCourse = await client.query(
      `SELECT * FROM user_courses 
       WHERE user_id = $1 AND is_active = true 
       AND personalized_topics IS NOT NULL 
       AND jsonb_array_length(personalized_topics) > 0`,
      [userId]
    );

    if (existingCourse.rows.length > 0) {
      // Already has a valid personalized course, return it
      return {
        success: true,
        data: {
          ...existingCourse.rows[0],
          personalizedTopicsCount:
            existingCourse.rows[0].personalized_topics.length,
        },
        message: "Personalized course already exists",
      };
    }

    // Deactivate all previous active courses for this user
    await client.query(
      "UPDATE user_courses SET is_active = false WHERE user_id = $1 AND is_active = true",
      [userId]
    );

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 84); // 12 weeks * 7 days = 84 days

    // Get user's onboarding data directly by user ID
    const onboardingResult = await client.query(
      "SELECT * FROM onboarding_data WHERE user_id = $1",
      [userId]
    );

    const conversationResult = await client.query(
      "SELECT transcript FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5",
      [userId]
    );

    let personalizedTopics = [];

    // Only proceed if onboarding data exists
    if (onboardingResult.rows.length > 0) {
      try {
        const onboardingData = onboardingResult.rows[0];
        const conversations = conversationResult.rows.map(
          (row) => row.transcript
        ); // may be empty
        personalizedTopics = await generatePersonalizedCourse(
          onboardingData,
          conversations
        );
      } catch (error) {
        console.error("Error generating personalized course:", error);
        throw new Error("Failed to generate personalized course. Please complete onboarding and try again.");
      }
    } else {
      // No onboarding data, do not create a course
      throw new Error("Onboarding data not found. Please complete onboarding first.");
    }

    // Only create course if personalized topics are generated
    if (!personalizedTopics || personalizedTopics.length === 0) {
      throw new Error("Personalized topics could not be generated. Please retry after completing onboarding.");
    }

    // Create new course with personalized topics
    const result = await client.query(
      `INSERT INTO user_courses (user_id, course_start_date, course_end_date, current_week, current_day, is_active, personalized_topics)
       VALUES ($1, $2, $3, 1, 1, true, $4)
       RETURNING *`,
      [userId, startDate, endDate, JSON.stringify(personalizedTopics)]
    );

    return {
      success: true,
      data: {
        ...result.rows[0],
        personalizedTopicsCount: personalizedTopics.length,
      },
    };
  } finally {
    if (client) client.release();
  }
};

// Generate personalized course based on onboarding data and conversations
const generatePersonalizedCourse = async (onboardingData, conversations) => {
  try {
    // Import the AI service
    const { generateRoleplay } = require('../../core/ai');
    
    // Create a comprehensive profile from onboarding data
    const userProfile = {
      skillToImprove: onboardingData.skill_to_improve,
      languageStatement: onboardingData.language_statement,
      industry: onboardingData.industry,
      speakingFeelings: onboardingData.speaking_feelings,
      speakingFrequency: onboardingData.speaking_frequency,
      mainGoal: onboardingData.main_goal,
      gender: onboardingData.gender,
      currentLevel: onboardingData.current_level,
      nativeLanguage: onboardingData.native_language,
      interests: onboardingData.interests || [],
      englishStyle: onboardingData.english_style,
      tutorStyle: onboardingData.tutor_style || [],
      knownWords1: onboardingData.known_words_1 || [],
      knownWords2: onboardingData.known_words_2 || [],
      currentLearningMethods: onboardingData.current_learning_methods || []
    };
    
    // Generate personalized topics using AI
    const personalizedTopics = [];
    
    // Create scenarios based on user interests
    for (let i = 0; i < Math.min(userProfile.interests.length, 5); i++) {
      const interest = userProfile.interests[i];
      try {
        const roleplayResult = await generateRoleplay(
          "English learner", 
          `Enthusiastic expert in ${interest}`, 
          `Discussing ${interest} with an English learner at ${userProfile.currentLevel} level`
        );
        
        if (roleplayResult.success && roleplayResult.data) {
          personalizedTopics.push({
            id: `topic_interest_${i + 1}`,
            title: `${interest.charAt(0).toUpperCase() + interest.slice(1)} Discussion`,
            prompt: roleplayResult.data.prompt,
            firstPrompt: roleplayResult.data.firstPrompt,
            category: interest.charAt(0).toUpperCase() + interest.slice(1)
          });
        }
      } catch (error) {
        console.warn(`Failed to generate AI topic for interest ${interest}:`, error.message);
      }
    }
    
    // Create scenario based on industry
    try {
      const industryRoleplay = await generateRoleplay(
        "English learner", 
        `Colleague in ${userProfile.industry} industry`, 
        `Practicing workplace communication in ${userProfile.industry} at ${userProfile.currentLevel} level`
      );
      
      if (industryRoleplay.success && industryRoleplay.data) {
        personalizedTopics.push({
          id: 'topic_industry_1',
          title: `Workplace Communication in ${userProfile.industry}`,
          prompt: industryRoleplay.data.prompt,
          firstPrompt: industryRoleplay.data.firstPrompt,
          category: 'Work'
        });
      }
    } catch (error) {
      console.warn(`Failed to generate AI topic for industry ${userProfile.industry}:`, error.message);
    }
    
    // Create general English learning topics using AI
    const generalScenarios = [
      {
        id: "topic_1",
        title: "Introduction and Personal Information",
        myRole: "English learner",
        otherRole: "Friendly conversation partner",
        situation: `Helping an English learner improve conversation skills by asking questions about personal information and hobbies at ${userProfile.currentLevel} level`
      },
      {
        id: "topic_2",
        title: "Daily Routine",
        myRole: "English learner",
        otherRole: "Someone interested in daily routines",
        situation: `Talking about daily routines and habits at ${userProfile.currentLevel} level`
      },
      {
        id: "topic_3",
        title: "Weekend Activities",
        myRole: "English learner",
        otherRole: "Someone curious about weekend activities",
        situation: `Discussing weekend activities at ${userProfile.currentLevel} level`
      },
      {
        id: "topic_4",
        title: "Food and Cooking",
        myRole: "English learner",
        otherRole: "Someone interested in food and cooking",
        situation: `Talking about favorite foods, cooking experiences, and food preferences at ${userProfile.currentLevel} level`
      },
      {
        id: "topic_5",
        title: "Travel Experiences",
        myRole: "English learner",
        otherRole: "Someone who loves to travel",
        situation: `Discussing travel experiences and dream destinations at ${userProfile.currentLevel} level`
      }
    ];
    
    // Generate AI topics for general scenarios
    for (const scenario of generalScenarios) {
      try {
        const roleplayResult = await generateRoleplay(
          scenario.myRole,
          scenario.otherRole,
          scenario.situation
        );
        
        if (roleplayResult.success && roleplayResult.data) {
          personalizedTopics.push({
            id: scenario.id,
            title: scenario.title,
            prompt: roleplayResult.data.prompt,
            firstPrompt: roleplayResult.data.firstPrompt,
            category: scenario.title.includes("Introduction") ? "Personal Information" : 
                     scenario.title.includes("Daily") ? "Daily Life" :
                     scenario.title.includes("Weekend") ? "Leisure" :
                     scenario.title.includes("Food") ? "Food" :
                     scenario.title.includes("Travel") ? "Travel" : "General"
          });
        }
      } catch (error) {
        console.warn(`Failed to generate AI topic for ${scenario.title}:`, error.message);
      }
    }
    
    // Fill up to 84 topics with variations if needed
    while (personalizedTopics.length < 84) {
      const baseTopic = personalizedTopics[personalizedTopics.length % Math.min(personalizedTopics.length, 10)];
      personalizedTopics.push({
        ...baseTopic,
        id: `topic_${personalizedTopics.length + 1}`,
        title: `${baseTopic.title} - Variation ${Math.floor(personalizedTopics.length / 10) + 1}`
      });
    }
    
    // Return only the first 84 topics
    return personalizedTopics.slice(0, 84);
    
  } catch (error) {
    console.error('Error generating personalized course with AI:', error);
    // Fallback to basic topics if AI generation fails
    return [
      {
        id: "topic_1",
        title: "Introduction and Personal Information",
        prompt: "You are an English learner interested in improving conversation skills. Ask questions about personal information and hobbies.",
        firstPrompt: "Hi there! I'm excited to practice my English with you. Could you tell me a bit about yourself?",
        category: "Personal Information"
      },
      {
        id: "topic_2",
        title: "Daily Routine",
        prompt: "You are an English learner interested in talking about daily routines and habits.",
        firstPrompt: "I'd love to hear about your typical day. What does your daily routine look like?",
        category: "Daily Life"
      }
      // Add more topics as needed
    ];
  }
};

module.exports = {
  fetchListeningTopics,
  fetchCourseStatus,
  initializeCourse
};