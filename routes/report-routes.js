// routes/report-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { authenticateToken } = require('./auth-routes');
const axios = require('axios');

// POST /api/report/completed - Mark report as completed for the authenticated user
router.post('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Update the user's report completion status
    const result = await pool.query(
      'UPDATE users SET report_completed = true, updated_at = NOW() WHERE id = $1 RETURNING id, report_completed',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        reportCompleted: result.rows[0].report_completed
      }
    });

  } catch (error) {
    console.error('Error updating report completion status:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to update report completion status. Please try again later.'
    });
  }
});

// GET /api/report/completed - Check if the authenticated user has completed the report
router.get('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get the user's report completion status
    const result = await pool.query(
      'SELECT report_completed FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        reportCompleted: result.rows[0].report_completed || false
      }
    });

  } catch (error) {
    console.error('Error checking report completion status:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to check report completion status. Please try again later.'
    });
  }
});

/**
 * POST /generate-report
 * Generate report for test calls using Groq API
 * Matches Python /generate-report endpoint exactly (called from frontend)
 */
router.post('/generate-report', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { current_transcript } = req.body;

    // Fetch previous conversations from database
    const conversationsResult = await pool.query(
      `
      SELECT id, room_name, user_id, timestamp, transcript
      FROM conversations
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT 10
    `,
      [userId]
    );

    console.log(
      `Fetched ${conversationsResult.rows.length} previous conversations for user ${userId}`
    );

    // Flatten transcripts - combine previous conversations with current transcript
    const combinedTurns = [];

    // Add previous conversations
    for (const row of conversationsResult.rows) {
      try {
        const transcript = typeof row.transcript === 'string' 
          ? JSON.parse(row.transcript) 
          : row.transcript;
        
        if (transcript.messages && Array.isArray(transcript.messages)) {
          combinedTurns.push(...transcript.messages);
        } else if (transcript.items && Array.isArray(transcript.items)) {
          combinedTurns.push(...transcript.items);
        }
      } catch (error) {
        console.warn('Error parsing transcript:', error);
      }
    }

    // Add current transcript if provided
    if (current_transcript) {
      try {
        const current = typeof current_transcript === 'string'
          ? JSON.parse(current_transcript)
          : current_transcript;
        
        if (current.messages && Array.isArray(current.messages)) {
          combinedTurns.push(...current.messages);
        } else if (current.items && Array.isArray(current.items)) {
          combinedTurns.push(...current.items);
        }
      } catch (error) {
        console.warn('Error parsing current transcript:', error);
      }
    }

    if (combinedTurns.length === 0) {
      return res.json({
        success: false,
        error: 'No conversation data available for analysis',
      });
    }

    // Filter to user messages only (matching Python logic: item.role === 'user' && item.content)
    const transcriptItems = combinedTurns.filter(
      (t) => t.role === 'user' && t.content
    );

    if (transcriptItems.length === 0) {
      return res.json({
        success: false,
        error: 'No valid transcript items found for analysis',
      });
    }

    // Generate report using Groq API (matching Python generate_report_with_groq)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const GROQ_MODEL_REPORT = process.env.GROQ_MODEL_REPORT || 'openai/gpt-oss-120b';
    const GROQ_MODEL_FALLBACK = process.env.GROQ_MODEL_FALLBACK || 'meta-llama/llama-guard-4-12b';

    if (!GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'GROQ_API_KEY is not set in environment variables',
      });
    }

    const model = GROQ_MODEL_REPORT || GROQ_MODEL_FALLBACK;

    // Sample report structure (matching Python SAMPLE_REPORT)
    const SAMPLE_REPORT = {
      fluency: {
        fluencyScore: 75,
        fluencyLevel: 'B1',
        wordsPerMinute: {
          value: 120,
          emoji: '🚀',
          feedback: 'Your speaking pace is good, but you can aim for a slightly faster pace to reach advanced fluency.',
          speedBarPercent: 75,
        },
        fillerWords: {
          percentage: 5,
          feedback: "You used some filler words like 'um' and 'uh'. Try to reduce these for smoother speech.",
        },
        hesitationsAndCorrections: {
          rate: 2,
          feedback: 'You had a few hesitations. Practice pausing intentionally to gather thoughts.',
        },
      },
      vocabulary: {
        vocabularyScore: 70,
        vocabularyLevel: 'B1',
        activeVocabulary: 150,
        uniqueWords: 100,
        lexicalDiversity: {
          score: 65,
          feedback: 'Your vocabulary diversity is moderate. Try incorporating more advanced words.',
        },
        levelBreakdown: {
          A1: 50,
          A2: 30,
          B1: 15,
          B2: 5,
          C1: 0,
          C2: 0,
        },
        wordSuggestions: {
          good: [
            { word: 'excellent', level: 'B2', definition: 'Of the highest quality', color: '#60A5FA' },
            { word: 'superb', level: 'C1', definition: 'Outstanding or impressive', color: '#34D399' },
          ],
        },
        exampleSentences: {
          excellent: 'Your performance was excellent during the presentation.',
          superb: 'The team delivered a superb result on the project.',
        },
        idiomaticLanguage: {
          usedCorrectly: 2,
          missedOpportunities: 3,
          feedback: "You used some idioms correctly but missed opportunities to use phrases like 'hit the nail on the head'.",
        },
      },
      grammar: {
        grammarScore: 80,
        grammarLevel: 'B2',
        growthPoints: ['Subject-verb agreement', 'Correct use of prepositions'],
        sentenceComplexity: {
          score: 70,
          feedback: 'Your sentences are moderately complex. Try using more compound sentences.',
        },
        grammarErrors: {
          articles: [
            {
              description: "Incorrect use of article",
              incorrectSentence: "I saw a elephant in zoo.",
              correctedSentence: "I saw an elephant in the zoo."
            }
          ],
          verbAgreement: [
            {
              description: "Subject-verb agreement error",
              incorrectSentence: "She go to school every day.",
              correctedSentence: "She goes to school every day."
            }
          ]
        },
      },
      discourse: {
        discourseScore: 65,
        discourseLevel: 'B1',
        cohesion: {
          score: 70,
          feedback: "You used some connectors well, but try adding more transitions like 'therefore'.",
        },
        coherence: {
          score: 60,
          feedback: 'Your ideas are mostly clear, but ensure your points are logically ordered.',
        },
      },
      improvementTarget: {
        nextLevel: 'B2',
        percentToNextLevel: 20,
      },
    };

    // Build system prompt matching Python exactly
    const systemPrompt = `You are a world-class English language assessment AI specializing in comprehensive conversation analysis. Your task is to analyze the provided conversation transcript and generate a detailed, accurate report.

CRITICAL ANALYSIS REQUIREMENTS:
1. Analyze ONLY the conversation transcript provided - no external data or assumptions
2. Provide COMPREHENSIVE analysis of ALL aspects: fluency, vocabulary, grammar, and discourse
3. For EVERY field in the report structure, provide meaningful data or set to null if insufficient information
4. Use ONLY the user's actual words, sentences, and speech patterns from the transcript
5. If the transcript lacks sufficient content for analysis, clearly indicate this and set relevant fields to null
6. Be exhaustive in grammar error detection - find EVERY error in the transcript
7. Provide specific, actionable feedback based on actual user speech patterns
8. Ensure all numerical values are accurate and based on transcript analysis
9. Maintain consistency between scores, levels, and feedback across all sections
10. DO NOT use markdown, extra text, or break JSON structure; output ONLY valid JSON. No trailing commas or syntax errors. Use plain numbers for scores/percentages/rates (e.g., "score": 75). Set fields to null if data insufficient. Never fabricate data.

The structure to use is exactly as in the following example (all fields required, types must match):
${JSON.stringify(SAMPLE_REPORT, null, 2)}

CRITICAL WARNING: The sample above is ONLY for showing the required JSON structure. DO NOT use any of its data, content, words, sentences, examples, or feedback. Analyze ONLY the transcript provided. Reference the user's actual words for examples and feedback. If a field cannot be filled due to insufficient data, set it to null.`;

    const userMessage = `Analyze this conversation transcript and generate a comprehensive English language assessment report. Focus on the user's actual speech patterns, vocabulary usage, grammar, and fluency: ${JSON.stringify(transcriptItems)}`;

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const groqPayload = {
      model: model,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    };

    // Call Groq API
    let groqResponse;
    try {
      groqResponse = await axios.post(
        process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
        groqPayload,
        {
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );
    } catch (error) {
      // Handle axios errors (network, timeout, etc.)
      if (error.response) {
        // HTTP error response
        const errorData = error.response.data || {};
        const errorMsg = errorData.error?.message || error.response.statusText || error.message;
        throw new Error(`Groq API error! Status: ${error.response.status}. Details: ${errorMsg}`);
      } else if (error.request) {
        // Request made but no response
        throw new Error(`Groq API error! No response received. Details: ${error.message}`);
      } else {
        // Error setting up request
        throw new Error(`Groq API error! ${error.message}`);
      }
    }

    if (!groqResponse.data || !groqResponse.data.choices || !groqResponse.data.choices[0]) {
      throw new Error('Invalid response from Groq API');
    }

    const contentString = groqResponse.data.choices[0].message.content;

    if (!contentString) {
      throw new Error('No content received from AI');
    }

    // Parse JSON response (matching Python logic)
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

    try {
      const parsedData = JSON.parse(jsonString);
      console.log(`Generated report for user ${userId} using Groq API`);

      return res.json({
        success: true,
        data: parsedData,
      });
    } catch (error) {
      console.error(`Failed to parse Groq response as JSON:`, error);
      throw new Error('AI returned malformed JSON');
    }
  } catch (error) {
    console.error('Error generating report:', error);
    return res.json({
      success: false,
      error: error.message || 'Failed to generate report',
    });
  }
});

module.exports = router;