/**
 * LLM Service
 * Shared interface to call Groq (or other) for structured outputs.
 */

const axios = require('axios');
const { reportPrompt, quizEvaluationPrompt, listeningQuizPrompt, quizGenerationPrompt, listeningQuizGenerationPrompt, courseGenerationPrompt, dailyReportPrompt } = require('../../constants/prompts');

const LLM_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_PRIMARY = 'openai/gpt-oss-120b';
const MODEL_FALLBACK = 'openai/gpt-oss-120b';

async function callGroq(prompt, messages, timeout = 60000) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const payload = {
    model: MODEL_PRIMARY,
    temperature: 0.2,
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

    const content = data?.choices?.[0]?.message?.content || '';
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
      const { data } = await axios.post(LLM_API_URL, { ...payload, model: MODEL_FALLBACK }, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeout,
      });
      const content = data?.choices?.[0]?.message?.content || '';
      return safeJson(content);
    } catch (e2) {
      // Log fallback error too
      console.error('[LLM Service] Groq API Fallback Error:', {
        message: e2.message,
        status: e2.response?.status,
        data: e2.response?.data,
      });
      throw err; // Throw original error
    }
  }
}

function safeJson(text) {
  // Strip code fences if present
  const cleaned = text.trim().replace(/^```json\n?|```$/g, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to find first JSON object in text
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const snippet = cleaned.slice(start, end + 1);
      try { return JSON.parse(snippet); } catch { }
    }
    throw new Error('LLM did not return valid JSON');
  }
}

const llmService = {
  async generateStructuredReport(userUtterances) {
    const messages = [
      { role: 'user', content: JSON.stringify({ utterances: userUtterances }) },
    ];
    return await callGroq(reportPrompt, messages, 60000);
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
      const timeout = task === 'report' ? 60000 : 30000;
      return await callGroq(promptConfig, messages, timeout);
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
      const timeout = task === 'dailyReport' ? 60000 : 30000;
      return await callGroq(systemPrompt, messages, timeout);
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
};

module.exports = llmService;
