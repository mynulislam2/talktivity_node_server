/**
 * Listening Module Service
 * Manages listening quiz generation from topics and session tracking
 */

const db = require('../../core/db/client');
const listeningTopics = require('../../../listening-topics');
const llmService = require('../../core/llm/llmService');
const { listeningQuizGenerationPrompt } = require('../../constants/prompts');

const listeningService = {
  /**
   * Generate listening comprehension quiz from topic data
   * Uses topic's full conversation and AI to create 5 questions
   */
  async generateListeningQuizFromTopic(topic) {
    if (!topic || !topic.conversation) {
      throw new Error('Topic conversation not found');
    }

    const conversation = topic.conversation;

    // Check for meaningful conversation content
    const totalWords = conversation.split(/\s+/).filter(word => word.length > 0).length;

    if (totalWords < 50) {
      throw new Error('Insufficient conversation content for listening quiz generation');
    }

    console.log(`Generating listening quiz for topic: ${topic.title}`);

    // Generate listening quiz using LLM service
    const userMessage = `Analyze this conversation and create 5 listening comprehension questions. Focus on real content, quotes, and details from the conversation:\n\n${conversation}`;

    const groqPayload = {
      messages: [
        { role: "system", content: listeningQuizGenerationPrompt },
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

    console.log(`✅ Successfully generated listening quiz for topic: ${topic.title}`);
    return parsedData.questions;
  },

  /**
   * Get today's listening topic
   * Cycles through available listening topics based on day
   */
  async getTodayListeningTopic(dayNumber) {
    const topicIndex = (dayNumber - 1) % listeningTopics.length;
    return listeningTopics[topicIndex] || null;
  },
};

module.exports = listeningService;
