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
    
    // Create a detailed prompt for the AI to generate personalized topics
    const systemPrompt = `You are an expert English learning course designer. Based on the user's profile and conversation history, create a personalized 12-week English conversation course with 84 topics (12 weeks × 7 days).
    
    USER PROFILE:
    - Skill to improve: ${userProfile.skillToImprove}
    - Language background: ${userProfile.languageStatement}
    - Industry: ${userProfile.industry}
    - Speaking comfort level: ${userProfile.speakingFeelings}
    - Speaking frequency: ${userProfile.speakingFrequency}
    - Main goal: ${userProfile.mainGoal}
    - Gender: ${userProfile.gender}
    - Current level: ${userProfile.currentLevel}
    - Native language: ${userProfile.nativeLanguage}
    - Interests: ${userProfile.interests.join(', ')}
    - Preferred English style: ${userProfile.englishStyle}
    - Preferred tutor style: ${userProfile.tutorStyle.join(', ')}
    
    Create diverse, engaging conversation topics that match the user's interests, level, and goals. Each topic should include:
    1. A unique ID (topic_1, topic_2, etc.)
    2. A descriptive title
    3. A prompt for the AI role (describing the persona the AI should embody)
    4. A first prompt (the opening line the AI should say)
    5. A category
    
    Make sure topics progress in difficulty and cover various aspects of English conversation.
    Return ONLY a JSON array of 84 topic objects with the exact structure shown in the example.`;
    
    const userPrompt = `Generate a personalized 12-week English conversation course with 84 topics based on this user profile. Return ONLY a JSON array of topic objects.`;
    
    // For now, we'll create a set of sample topics based on the user's profile
    // In a production environment, this would call the AI service
    const sampleTopics = [];
    
    // Create topics based on user interests
    const interestBasedTopics = userProfile.interests.map((interest, index) => ({
      id: `topic_interest_${index + 1}`,
      title: `${interest.charAt(0).toUpperCase() + interest.slice(1)} Discussion`,
      prompt: `You are an enthusiastic expert in ${interest}. Engage the learner in a conversation about ${interest} in a way that's appropriate for their ${userProfile.currentLevel} level.`,
      firstPrompt: `I'm excited to talk with you about ${interest}! What would you like to know or discuss about this topic?`,
      category: interest.charAt(0).toUpperCase() + interest.slice(1)
    }));
    
    // Create topics based on industry
    const industryTopic = {
      id: 'topic_industry_1',
      title: `Workplace Communication in ${userProfile.industry}`,
      prompt: `You are a colleague in the ${userProfile.industry} industry. Help the learner practice workplace communication relevant to their field at their ${userProfile.currentLevel} level.`,
      firstPrompt: `Hi there! I work in ${userProfile.industry} too. What aspects of workplace communication would you like to practice?`,
      category: 'Work'
    };
    
    // Create general English learning topics
    const generalTopics = [
      {
        id: "topic_1",
        title: "Introduction and Personal Information",
        prompt: `You are a friendly English conversation partner interested in helping the learner improve their speaking skills. Ask questions about personal information and hobbies in a way appropriate for their ${userProfile.currentLevel} level.`,
        firstPrompt: "Hi there! I'm excited to practice English with you. Could you tell me a bit about yourself?",
        category: "Personal Information"
      },
      {
        id: "topic_2",
        title: "Daily Routine",
        prompt: `You are an English learner interested in talking about daily routines and habits. Keep the conversation at a ${userProfile.currentLevel} level.`,
        firstPrompt: "I'd love to hear about your typical day. What does your daily routine look like?",
        category: "Daily Life"
      },
      {
        id: "topic_3",
        title: "Weekend Activities",
        prompt: `You are someone curious about how the learner spends their weekends. Keep questions appropriate for ${userProfile.currentLevel} level English.`,
        firstPrompt: "What do you usually do on weekends? I'm curious to hear about your activities!",
        category: "Leisure"
      },
      {
        id: "topic_4",
        title: "Food and Cooking",
        prompt: `You are someone interested in food and cooking. Ask about favorite foods, cooking experiences, and food preferences. Keep it at ${userProfile.currentLevel} level.`,
        firstPrompt: "I love trying new foods! What's your favorite dish to cook or eat?",
        category: "Food"
      },
      {
        id: "topic_5",
        title: "Travel Experiences",
        prompt: `You are someone who loves to travel and hear about others' travel experiences. Ask about places visited, dream destinations, etc. Keep it at ${userProfile.currentLevel} level.`,
        firstPrompt: "I'm planning a trip soon. Have you traveled anywhere interesting? I'd love to hear about it!",
        category: "Travel"
      }
    ];
    
    // Combine all topics
    const allTopics = [...generalTopics, industryTopic, ...interestBasedTopics];
    
    // Fill up to 84 topics with variations
    while (allTopics.length < 84) {
      const baseTopic = generalTopics[allTopics.length % generalTopics.length];
      allTopics.push({
        ...baseTopic,
        id: `topic_${allTopics.length + 1}`,
        title: `${baseTopic.title} - Variation ${Math.floor(allTopics.length / generalTopics.length) + 1}`
      });
    }
    
    // Return only the first 84 topics
    return allTopics.slice(0, 84);
    
  } catch (error) {
    console.error('Error generating personalized course:', error);
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