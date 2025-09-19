// src/modules/quiz/service.js
// Quiz business logic

const { generateQuiz, generateListeningQuiz } = require('../../core/ai');
const { getLatestConversations } = require('../../core/db/client');

// Generate a quiz with attempts logic
const createQuizWithAttempts = async (userId) => {
  try {
    const maxAttempts = 8;
    const attemptInterval = 5000; // 5 seconds between attempts
    let attempts = 0;
    let success = false;
    let result = null;

    // Get latest conversations (not just today's)
    const conversations = await getLatestConversations(userId, 10);
    
    if (!conversations || conversations.length === 0) {
      throw new Error('No conversations found for user');
    }

    // Parse transcript items
    const transcriptItems = conversations
      .map((item) => {
        try {
          const parsed = JSON.parse(item.transcript);
          return parsed.items || [];
        } catch (error) {
          console.error("Error parsing transcript item:", error);
          return [];
        }
      })
      .flat()
      .filter((item) => item.role === 'user' && item.content);

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No valid transcript items found for user');
    }

    const attemptGeneration = async () => {
      try {
        attempts++;
        console.log(`Quiz generation attempt ${attempts}/${maxAttempts} for user ${userId}`);

        // Always wait for the full attempt cycle before calling API
        if (attempts < maxAttempts) {
          console.log(`Data validation successful on attempt ${attempts}, but waiting for full attempt cycle. Will retry.`);
          return false;
        }

        console.log(`Final attempt ${attempts} reached. Calling Groq API...`);

        // Generate quiz using AI service
        const groqResponse = await generateQuiz(transcriptItems);
        
        if (!groqResponse.success) {
          throw new Error(groqResponse.error || 'Failed to generate quiz');
        }

        result = groqResponse.data;
        success = true;
        return true;

      } catch (error) {
        console.error(`Quiz generation attempt ${attempts} failed:`, error);
        return false;
      }
    };

    // Try immediately first
    await attemptGeneration();

    // If not successful, retry with intervals
    while (!success && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, attemptInterval));
      await attemptGeneration();
    }

    if (success && result) {
      return {
        success: true,
        data: result,
        attempts: attempts
      };
    } else {
      throw new Error(`Failed to generate quiz after ${attempts} attempts. Please try again later.`);
    }

  } catch (error) {
    console.error('Error in generate-quiz-with-attempts:', error);
    throw new Error(error.message || 'Failed to generate quiz');
  }
};

// Generate a listening quiz with attempts logic
const createListeningQuizWithAttempts = async (userId) => {
  try {
    const maxAttempts = 1;
    const attemptInterval = 1000; // 1 second between attempts
    let attempts = 0;
    let success = false;
    let result = null;

    // Get latest conversations (not just today's)
    const conversations = await getLatestConversations(userId, 10);
    
    if (!conversations || conversations.length === 0) {
      throw new Error('No conversations found for user');
    }

    // Parse transcript items and create conversation text
    const transcriptItems = conversations
      .map((item) => {
        try {
          const parsed = JSON.parse(item.transcript);
          return parsed.items || [];
        } catch (error) {
          console.error("Error parsing transcript item:", error);
          return [];
        }
      })
      .flat()
      .filter((item) => item.content);

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No valid transcript items found for user');
    }

    // Create conversation text from transcript items
    const conversation = transcriptItems
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');

    // Check for meaningful conversation content
    const totalWords = conversation.split(/\s+/).filter(word => word.length > 0).length;

    if (totalWords < 50) {
      throw new Error('Insufficient conversation content for listening quiz generation.');
    }

    const attemptGeneration = async () => {
      try {
        attempts++;
        console.log(`Listening quiz generation attempt ${attempts}/${maxAttempts} for user ${userId}`);

        // Always wait for the full attempt cycle before calling API
        if (attempts < maxAttempts) {
          console.log(`Data validation successful on attempt ${attempts}, but waiting for full attempt cycle. Will retry.`);
          return false;
        }

        console.log(`Final attempt ${attempts} reached. Calling Groq API...`);

        // Generate listening quiz using AI service
        const groqResponse = await generateListeningQuiz(conversation);
        
        if (!groqResponse.success) {
          throw new Error(groqResponse.error || 'Failed to generate listening quiz');
        }

        result = groqResponse.data;
        success = true;
        return true;

      } catch (error) {
        console.error(`Listening quiz generation attempt ${attempts} failed:`, error);
        return false;
      }
    };

    // Try immediately first
    await attemptGeneration();

    // If not successful, retry with intervals
    while (!success && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, attemptInterval));
      await attemptGeneration();
    }

    if (success && result) {
      return {
        success: true,
        data: result,
        attempts: attempts
      };
    } else {
      throw new Error(`Failed to generate listening quiz after ${attempts} attempts. Please try again later.`);
    }

  } catch (error) {
    console.error('Error in generate-listening-quiz-with-attempts:', error);
    throw new Error(error.message || 'Failed to generate listening quiz');
  }
};

module.exports = {
  createQuizWithAttempts,
  createListeningQuizWithAttempts
};