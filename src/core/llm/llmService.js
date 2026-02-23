/**
 * LLM Service
 * Shared interface to call Groq (or other) for structured outputs.
 */

const axios = require('axios');
const { reportPrompt, quizEvaluationPrompt, listeningQuizPrompt, quizGenerationPrompt, listeningQuizGenerationPrompt, courseGenerationPrompt, dailyReportPrompt, roleplayGenerationPrompt } = require('../../constants/prompts');

const LLM_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_PRIMARY = process.env.GROQ_MODEL_REPORT || process.env.MODEL_REPORT || "mixtral-8x7b-32768";
const MODEL_FALLBACK = process.env.GROQ_MODEL_FALLBACK || 'llama-3.3-70b-versatile';

async function callGroq(prompt, messages, timeout = 60000, maxTokens = 16384) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const payload = {
    model: MODEL_PRIMARY,
    temperature: 0.2,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: prompt },
      ...messages,
    ],
  };

  try {
    const { data } = await axios.post(LLM_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: timeout,
    });

    // Validate response structure
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('[LLM Service] Invalid Groq response structure:', JSON.stringify(data, null, 2));
      throw new Error('Groq API returned invalid response structure');
    }

    const choice = data.choices[0];
    const finishReason = choice?.finish_reason;
    const content = choice?.message?.content || '';
    
    // Check if response was truncated due to token limit
    if (finishReason === 'length') {
      const usage = data.usage || {};
      const completionTokens = usage.completion_tokens || 0;
      const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens || 0;
      console.error('[LLM Service] Response truncated - max_tokens reached', {
        completionTokens,
        reasoningTokens,
        maxTokens,
        hasContent: !!content && content.length > 0,
      });
      
      // If content is empty but we hit the limit, the model used all tokens for reasoning
      if (!content || content.trim().length === 0) {
        throw new Error(`Groq API response truncated: model used all ${completionTokens} tokens for reasoning, leaving no tokens for content. Consider increasing max_tokens or using a non-reasoning model.`);
      }
      
      // If we have some content but it was truncated, log a warning but continue
      console.warn('[LLM Service] Response was truncated but contains content. Content may be incomplete.');
    }
    
    // Log content for debugging (truncated if too long)
    if (!content || content.trim().length === 0) {
      console.error('[LLM Service] Empty content from Groq API. Full response:', JSON.stringify(data, null, 2));
      const errorMsg = finishReason === 'length' 
        ? 'Groq API returned empty content: all tokens were used for reasoning'
        : `Groq API returned empty content (finish_reason: ${finishReason || 'unknown'})`;
      throw new Error(errorMsg);
    }

    console.log(`[LLM Service] Received content from Groq (${content.length} chars, first 200: ${content.substring(0, 200)})`);
    
    return safeJson(content);
  } catch (err) {
    // Log detailed error information
    const errorDetails = {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      config: {
        url: err.config?.url,
        method: err.config?.method,
        dataSize: err.config?.data ? JSON.stringify(err.config.data).length : 0,
      }
    };
    console.error('[LLM Service] Groq API Error:', JSON.stringify(errorDetails, null, 2));

    // Fallback attempt
    try {
      console.log('[LLM Service] Attempting fallback with model:', MODEL_FALLBACK);
      // For fallback model, cap max_tokens at safe limit (32768 for llama-3.3-70b)
      const fallbackMaxTokens = Math.min(maxTokens, 32768);
      const fallbackPayload = { ...payload, model: MODEL_FALLBACK, max_tokens: fallbackMaxTokens };
      const { data } = await axios.post(LLM_API_URL, fallbackPayload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeout,
      });

      // Validate fallback response structure
      if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        console.error('[LLM Service] Invalid fallback response structure:', JSON.stringify(data, null, 2));
        throw new Error('Groq API fallback returned invalid response structure');
      }

      const fallbackChoice = data.choices[0];
      const fallbackFinishReason = fallbackChoice?.finish_reason;
      const content = fallbackChoice?.message?.content || '';
      
      // Check if fallback response was truncated
      if (fallbackFinishReason === 'length') {
        const usage = data.usage || {};
        const completionTokens = usage.completion_tokens || 0;
        console.error('[LLM Service] Fallback response truncated - max_tokens reached', {
          completionTokens,
          maxTokens: fallbackPayload.max_tokens,
          hasContent: !!content && content.length > 0,
        });
        
        if (!content || content.trim().length === 0) {
          throw new Error(`Groq API fallback response truncated: model used all ${completionTokens} tokens for reasoning`);
        }
      }
      
      if (!content || content.trim().length === 0) {
        console.error('[LLM Service] Empty content from Groq fallback. Full response:', JSON.stringify(data, null, 2));
        const errorMsg = fallbackFinishReason === 'length' 
          ? 'Groq API fallback returned empty content: all tokens were used for reasoning'
          : `Groq API fallback returned empty content (finish_reason: ${fallbackFinishReason || 'unknown'})`;
        throw new Error(errorMsg);
      }

      console.log(`[LLM Service] Fallback received content (${content.length} chars)`);
      return safeJson(content);
    } catch (e2) {
      // Log fallback error too
      console.error('[LLM Service] Groq API Fallback Error:', {
        message: e2.message,
        status: e2.response?.status,
        data: e2.response?.data,
        responseStructure: e2.response?.data ? {
          hasChoices: !!e2.response.data.choices,
          choicesLength: e2.response.data.choices?.length,
          firstChoice: e2.response.data.choices?.[0] ? {
            hasMessage: !!e2.response.data.choices[0].message,
            hasContent: !!e2.response.data.choices[0].message?.content,
            contentLength: e2.response.data.choices[0].message?.content?.length,
          } : null,
        } : null,
      });
      throw err; // Throw original error
    }
  }
}

function safeJson(text) {
  if (!text || typeof text !== 'string') {
    console.error('[LLM Service] safeJson received invalid input:', typeof text, text);
    throw new Error('LLM did not return valid JSON: empty or invalid input');
  }

  // Strip code fences if present
  let cleaned = text.trim().replace(/^```json\n?/i, '').replace(/```$/g, '').trim();
  
  // Log what we're trying to parse (truncated)
  if (cleaned.length > 500) {
    console.log(`[LLM Service] Attempting to parse JSON (${cleaned.length} chars, first 500: ${cleaned.substring(0, 500)})`);
  } else {
    console.log(`[LLM Service] Attempting to parse JSON: ${cleaned}`);
  }

  try {
    return JSON.parse(cleaned);
  } catch (parseError) {
    console.warn('[LLM Service] Initial JSON parse failed, attempting extraction:', parseError.message);
    
    // Attempt to find first JSON object in text
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const snippet = cleaned.slice(start, end + 1);
      console.log(`[LLM Service] Extracted JSON snippet (${snippet.length} chars): ${snippet.substring(0, 200)}`);
      try { 
        return JSON.parse(snippet); 
      } catch (extractError) {
        console.error('[LLM Service] Extracted snippet also failed to parse:', extractError.message);
        console.error('[LLM Service] Snippet content:', snippet);
      }
    }
    
    // Attempt to find JSON array
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      const arraySnippet = cleaned.slice(arrayStart, arrayEnd + 1);
      try {
        return JSON.parse(arraySnippet);
      } catch (arrayError) {
        console.error('[LLM Service] Array extraction also failed:', arrayError.message);
      }
    }
    
    console.error('[LLM Service] Failed to extract valid JSON from:', cleaned.substring(0, 1000));
    throw new Error(`LLM did not return valid JSON. Content preview: ${cleaned.substring(0, 200)}`);
  }
}

const llmService = {
  async generateStructuredReport(userUtterances) {
    const messages = [
      { role: 'user', content: JSON.stringify({ utterances: userUtterances }) },
    ];
    return await callGroq(reportPrompt, messages, 60000, 32768);
  },

  async evaluateQuizAnswers(answers) {
    const messages = [
      { role: 'user', content: JSON.stringify({ answers }) },
    ];
    return await callGroq(quizEvaluationPrompt, messages, 30000);
  },

  async evaluateListeningQuiz(answers) {
    const messages = [
      { role: 'user', content: JSON.stringify({ answers }) },
    ];
    return await callGroq(listeningQuizPrompt, messages, 30000);
  },

  /**
   * Call Groq with custom payload (for quiz and listening quiz generation)
   * Returns raw string content (not auto-parsed JSON)
   */
  async callGroqRaw(payload) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const fullPayload = {
      model: payload.model || MODEL_PRIMARY,
      temperature: payload.temperature || 0.7,
      max_tokens: payload.max_tokens || 8192,
      ...payload,
    };

    try {
      const { data } = await axios.post(LLM_API_URL, fullPayload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      });

      return data?.choices?.[0]?.message?.content || '';
    } catch (err) {
      // Fallback attempt
      try {
        const { data } = await axios.post(LLM_API_URL, { ...fullPayload, model: MODEL_FALLBACK }, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        });
        return data?.choices?.[0]?.message?.content || '';
      } catch (e2) {
        throw err;
      }
    }
  },

  /**
   * Generic runner: pass task name and payload; uses centralized prompts
   */
  async run(task, payload, options = {}) {
    const map = {
      report: reportPrompt,
      quizGenerate: quizGenerationPrompt,
      listeningQuizGenerate: listeningQuizGenerationPrompt,
      courseGenerate: courseGenerationPrompt,
      dailyReport: dailyReportPrompt,
    };

    const promptConfig = map[task];
    if (!promptConfig) throw new Error(`Unknown LLM task: ${task}`);

    // Handle both string prompts and object prompts (system + user)
    if (typeof promptConfig === 'string') {
      // Legacy single-string prompt
      const messages = [
        { role: 'user', content: JSON.stringify(payload) },
      ];
      // Use longer timeout for report tasks
      // Use higher max_tokens for report tasks to handle complex analysis
      const timeout = task === 'report' ? 60000 : 30000;
      const maxTokens = task === 'report' ? 32768 : 16384;
      return await callGroq(promptConfig, messages, timeout, maxTokens);
    } else if (typeof promptConfig === 'object' && promptConfig.systemPrompt && promptConfig.userPrompt) {
      // New structure: system + user with placeholder injection
      const systemPrompt = promptConfig.systemPrompt;
      const userPromptTemplate = promptConfig.userPrompt;

      // Inject transcript/payload into user prompt
      let userPrompt = userPromptTemplate.replace('{TRANSCRIPT_PLACEHOLDER}', JSON.stringify(payload));

      // For dailyReport, the payload is { transcript: [...] }, so we inject just the array
      if (task === 'dailyReport' && payload.transcript) {
        // Validate transcript is an array
        if (!Array.isArray(payload.transcript)) {
          throw new Error(`Invalid transcript format: expected array, got ${typeof payload.transcript}`);
        }

        // Log transcript info for debugging
        console.log(`[LLM Service] Processing ${payload.transcript.length} transcript items for dailyReport`);

        // Stringify the transcript array
        const transcriptJson = JSON.stringify(payload.transcript);
        const transcriptSize = transcriptJson.length;

        // Check if transcript is too large (Groq has limits)
        if (transcriptSize > 100000) { // ~100KB
          console.warn(`[LLM Service] Large transcript detected: ${transcriptSize} bytes`);
        }

        userPrompt = userPromptTemplate.replace('{TRANSCRIPT_PLACEHOLDER}', transcriptJson);
      }

      const messages = [
        { role: 'user', content: userPrompt },
      ];

      // Use longer timeout for dailyReport (60 seconds) as it processes more data
      // Use higher max_tokens for dailyReport to handle large transcripts and complex reasoning
      const timeout = task === 'dailyReport' ? 60000 : 30000;
      const maxTokens = task === 'dailyReport' ? 32768 : 16384;
      return await callGroq(systemPrompt, messages, timeout, maxTokens);
    } else {
      throw new Error(`Invalid prompt configuration for task: ${task}`);
    }
  },

  async generateQuizFromTranscript(transcriptItems) {
    const payload = { transcript: transcriptItems };
    return await this.run('quizGenerate', payload);
  },

  async generateListeningQuizFromTranscript(transcriptItems) {
    const payload = { transcript: transcriptItems };
    return await this.run('listeningQuizGenerate', payload);
  },

  async generateCoursePlan(onboardingData, conversations, excludedTopics = []) {
    const payload = { 
      onboarding: onboardingData, 
      conversations,
      excludedTopics: excludedTopics.length > 0 ? excludedTopics : undefined,
    };
    // Returns JSON array of 7 topic objects
    return await this.run('courseGenerate', payload);
  },

  async generateRolePlayScenario(myRole, otherRole, situation) {
    const messages = [
      { 
        role: 'user', 
        content: `Generate a roleplay scenario where:\n- I am playing the role of: ${myRole}\n- You (the AI) are playing the role of: ${otherRole}\n- The situation is: ${situation}\n\nReturn only a valid JSON object with "prompt" and "firstPrompt" fields.`
      },
    ];
    return await callGroq(roleplayGenerationPrompt, messages, 60000, 4096);
  },
};

module.exports = llmService;
