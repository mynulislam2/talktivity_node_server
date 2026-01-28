/**
 * Quizzes Module Service - POSTMAN ALIGNED
 * Extracted from routes/course-routes.js
 * Manages quiz completion, scoring, and exam tracking
 * 
 * Removed orphaned methods: getUserQuizResults(), getDailyQuizResult(),
 * getDailyListeningQuizResult(), getUserAverageQuizScore(), getWeeklyQuizStats(),
 * getAvailableQuizzes(), submitQuizAnswers()
 */

const db = require('../../core/db/client');
const llmService = require('../../core/llm/llmService');
const { quizGenerationPrompt } = require('../../constants/prompts');

const quizzesService = {
  // Single public API: generate quiz from conversations

  /**
   * Generate personalized quiz from user's recent conversations
   * Fetches latest conversations and uses LLM to create 5 questions
   * (Kept for internal use)
   */
  async generateQuizFromConversations(userId) {
    // Get latest conversations from database
    const conversationsResult = await db.queryAll(
      `SELECT id, room_name, user_id, timestamp, transcript 
       FROM conversations 
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT 10`,
      [userId]
    );

    if (!conversationsResult || conversationsResult.length === 0) {
      throw new Error('No conversations found. Please complete some speaking sessions first.');
    }

    // Parse transcript items
    const transcriptItems = conversationsResult
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
      throw new Error('No valid transcript items found. Please complete some speaking sessions first.');
    }

    console.log(`Found ${transcriptItems.length} transcript items for user ${userId}. Generating quiz...`);

    // Generate quiz using LLM service
    const userMessage = `Analyze this conversation transcript and create personalized quiz questions that will help the user improve their English skills. Focus on real content, quotes, and details from the conversation: ${JSON.stringify(transcriptItems)}`;

    const groqPayload = {
      messages: [
        { role: "system", content: quizGenerationPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      response_format: { "type": "json_object" },
    };

    const contentString = await llmService.callGroqRaw(groqPayload);

    // Parse JSON response
    let jsonString = contentString;
    if (jsonString.includes('```json')) {
      jsonString = jsonString.split('```json')[1] || jsonString;
    } else if (jsonString.includes('```')) {
      jsonString = jsonString.split('```')[1] || jsonString;
    }

    const startIndex = jsonString.indexOf('{');
    const endIndex = jsonString.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      throw new Error('AI returned malformed JSON');
    }
    jsonString = jsonString.substring(startIndex, endIndex + 1);

    const parsedData = JSON.parse(jsonString);

    // Validate structure
    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('AI response is not a valid object');
    }

    if (!parsedData.questions || !Array.isArray(parsedData.questions)) {
      throw new Error('AI response missing questions array');
    }

    if (parsedData.questions.length !== 5) {
      throw new Error(`Expected exactly 5 questions, got ${parsedData.questions.length}`);
    }

    console.log(`✅ Successfully generated quiz for user ${userId}`);
    return parsedData.questions;
  },
};

module.exports = quizzesService;
