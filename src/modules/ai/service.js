/**
 * AI Module Service
 * Handles AI-powered content generation using LLM service
 */

const llmService = require('../../core/llm/llmService');
const db = require('../../core/db/client');

const aiService = {
  /**
   * Generate roleplay scenario prompts
   */
  async generateRolePlayScenario(myRole, otherRole, situation) {
    const systemPrompt = `You are an expert English language learning assistant. Your task is to create engaging and realistic roleplay scenarios for English practice.

Generate a roleplay scenario based on the following details:
- User's Role: ${myRole}
- AI's Role: ${otherRole}
- Situation: ${situation}

You must return a JSON object with exactly two fields:
1. "prompt": A detailed system prompt for the AI assistant that sets up the roleplay scenario. This should be 2-3 sentences that describe the context, the AI's role, and how the AI should behave.
2. "firstPrompt": The first message the AI should say to start the conversation. This should be natural, engaging, and appropriate for the scenario.

Make the scenario realistic, engaging, and suitable for English practice. The prompts should encourage natural conversation.`;

    const userMessage = `Generate a roleplay scenario where:
- I am playing the role of: ${myRole}
- You (the AI) are playing the role of: ${otherRole}
- The situation is: ${situation}

Return only a valid JSON object with "prompt" and "firstPrompt" fields.`;

    try {
      const payload = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      };

      const content = await llmService.callGroqRaw(payload);
      
      // Parse JSON response robustly. Groq with response_format:'json_object' should
      // already return pure JSON, but keep a fallback for older formats.
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (primaryError) {
        // Legacy fallback: strip markdown fences / extra text and retry
        let jsonString = content;
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
        parsed = JSON.parse(jsonString);
      }

      // Validate structure
      if (!parsed.prompt || !parsed.firstPrompt) {
        throw new Error('AI response missing required fields: prompt and firstPrompt');
      }

      return {
        prompt: parsed.prompt,
        firstPrompt: parsed.firstPrompt,
      };
    } catch (error) {
      console.error('[AI Service] Error generating roleplay:', error);
      throw new Error(`Failed to generate roleplay scenario: ${error.message}`);
    }
  },

  /**
   * Generate quiz from user's conversations
   */
  async generateQuizFromConversations(userId) {
    // Reuse the quizzes service method
    const quizzesService = require('../quizzes/service');
    return await quizzesService.generateQuizFromConversations(userId);
  },

  /**
   * Generate listening quiz from conversation text
   */
  async generateListeningQuizFromConversation(conversation) {
    try {
      const payload = {
        messages: [
          {
            role: 'system',
            content:
              `You are an expert English language learning assistant.

Your task is to generate a listening comprehension quiz ONLY.

RESPONSE FORMAT (STRICT):
- You MUST return a single valid JSON object.
- The top-level object MUST have exactly one key: "questions".
- "questions" MUST be an array of 5 question objects.

Each question object MUST have these fields and ONLY these fields:
- "id": string              // unique ID for the question
- "question": string        // the question text about the conversation
- "options": string[4]      // array of EXACTLY 4 answer strings
- "correctAnswer": string   // one of "A", "B", "C", or "D"
- "explanation": string     // short explanation of why the correct answer is right

IMPORTANT CONSTRAINTS:
- Do NOT include any markdown, code fences, comments, or prose outside the JSON.
- Do NOT include any keys other than "questions" at the top level.
- Do NOT include any extra fields inside question objects.
- The final output MUST be syntactically valid JSON and parseable by JSON.parse().`,
          },
          {
            role: 'user',
            content:
            `
Generate 5 multiple-choice LISTENING COMPREHENSION questions based on the following conversation transcript.

CONVERSATION:

${conversation}

--------------------------------
INSTRUCTIONS:
- Focus questions on understanding the content, context, speaker intent, and key details from the conversation.
- Each question should be clear and unambiguous.
- For each question:
  - Provide 4 answer options in the "options" array.
  - Set "correctAnswer" to "A", "B", "C", or "D" based on the correct option.
  - Provide a short "explanation" that references the conversation.

OUTPUT:
- Return ONLY a single JSON object with the exact shape described in the system message.
- Do NOT include any text before or after the JSON.
            `,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      };

      const content = await llmService.callGroqRaw(payload);
      
      // Parse JSON response robustly. Groq with response_format:'json_object' should
      // already return pure JSON, but keep a fallback for older formats.
      let parsed;
      try {
        // Fast path: try to parse the content as-is
        parsed = JSON.parse(content);
      } catch (primaryError) {
        // Fallback: strip markdown fences / extra prose and retry
        let jsonString = content;
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
        parsed = JSON.parse(jsonString);
      }

      // Extract questions array in a very tolerant way
      let rawQuestions = [];
      if (Array.isArray(parsed)) {
        rawQuestions = parsed;
      } else if (Array.isArray(parsed.questions)) {
        rawQuestions = parsed.questions;
      } else if (Array.isArray(parsed.data)) {
        rawQuestions = parsed.data;
      } else if (Array.isArray(parsed.items)) {
        rawQuestions = parsed.items;
      }

      if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        console.warn('[AI Service] Listening quiz: AI response missing questions array, returning empty quiz.', parsed);
        return [];
      }

      // Normalize questions into the structure expected by the frontend
      const letters = ['A', 'B', 'C', 'D'];
      const normalized = rawQuestions.map((q, index) => {
        const options = Array.isArray(q.options) ? q.options.slice(0, 4) : [];

        // Map letter-based correctAnswer (A/B/C/D) to the actual option text.
        let correctAnswer = q.correctAnswer;
        if (typeof correctAnswer === 'string' && letters.includes(correctAnswer) && options.length === 4) {
          const letterIndex = letters.indexOf(correctAnswer);
          correctAnswer = options[letterIndex];
        }

        return {
          id: q.id || String(index + 1),
          type: q.type || 'listening-comprehension',
          prompt: q.prompt || 'Listen to the conversation and choose the best answer:',
          question: q.question || q.text || '',
          options,
          correctAnswer,
          explanation: q.explanation || '',
        };
      });

      return normalized;
    } catch (error) {
      console.error('[AI Service] Error generating listening quiz:', error);
      // Never break the user flow – return an empty quiz instead of throwing
      return [];
    }
  },
};

module.exports = aiService;
