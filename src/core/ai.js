// src/core/ai.js
// AI service for generating content using Groq API

const axios = require('axios');
const { config } = require('../config');

const SUPPORTED_MODELS = {
  roleplay: 'deepseek-r1-distill-llama-70b',
  report: 'deepseek-r1-distill-llama-70b',
  quiz: 'deepseek-r1-distill-llama-70b',
  listeningQuiz: 'deepseek-r1-distill-llama-70b',
  fallback: 'deepseek-r1-distill-llama-70b'
};

// Generate roleplay scenario
const generateRoleplay = async (myRole, otherRole, situation) => {
  try {
    if (!myRole || !otherRole || !situation) {
      throw new Error('Missing required fields: myRole, otherRole, situation');
    }

    const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
    const systemPrompt = `You are a creative and concise role-play scenario designer. Based on the provided 'user_role', 'other_person_role', and 'situation', generate two distinct strings:
1. 'prompt': A single sentence describing the AI's persona and objective for the role-play. **You (the AI) will act as the 'other_person_role' in this scenario. Your goal is to embody this persona fully, making the interaction realistic and engaging.**
2. 'firstPrompt': The exact opening line the AI (as the 'other_person_role') will say to the user. It should be engaging and initiate the scenario.

Ensure the 'prompt' and 'firstPrompt' are directly usable and sound natural in conversation. Also, these should be similar to the situation provided by the user; don't add your creativity here, but you can phrase the same thing in a good way.
Return your response as a JSON object with keys "prompt" and "firstPrompt".

Example:
User Role: New neighbor
Other Person Role: Friendly neighbor
Situation: Meeting someone who just moved in.
Output:
{
  "prompt": "You are a friendly and curious neighbor meeting someone who just moved in. Be warm, welcoming, and chatty. Ask about where they moved from, share local tips, and offer to help them settle in.",
  "firstPrompt": "Hi there! I'm your neighbor from across the street – just wanted to pop over and say welcome to the neighborhood! How's settling in going?"
}
`;
    const userMessage = `User's Role: ${myRole}\nOther Person's Role: ${otherRole}\nSituation: ${situation}\n\nGenerate the 'prompt' and 'firstPrompt' based on this information.`;

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const groqPayload = {
      model: SUPPORTED_MODELS.roleplay || SUPPORTED_MODELS.fallback,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" },
    };

    const groqResponse = await axios.post(groqApiUrl, groqPayload, {
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!groqResponse.data.choices || !groqResponse.data.choices[0]) {
      throw new Error("No response from AI");
    }

    const aiResponseContent = groqResponse.data.choices[0].message.content;

    let parsedAiOutput;
    try {
      parsedAiOutput = JSON.parse(aiResponseContent);
    } catch (jsonParseError) {
      console.error("Failed to parse AI response as JSON:", jsonParseError);
      console.error("AI response that failed parsing:", aiResponseContent);
      throw new Error("AI generated malformed JSON. Please try again.");
    }

    const { prompt, firstPrompt } = parsedAiOutput;

    if (!prompt || !firstPrompt) {
      throw new Error("AI did not generate expected 'prompt' or 'firstPrompt' fields.");
    }

    return {
      success: true,
      data: {
        prompt,
        firstPrompt
      }
    };

  } catch (error) {
    console.error('Error generating roleplay data:', error);
    throw new Error(error.message || 'Failed to generate roleplay data');
  }
};

// Generate conversation analysis report
const generateReport = async (transcriptItems) => {
  try {
    if (!transcriptItems || !Array.isArray(transcriptItems)) {
      throw new Error('Missing or invalid required field: transcriptItems (must be an array)');
    }

    // Sample report structure for the AI to follow
    const SAMPLE_REPORT = {
      fluency: {
        fluencyScore: 75,
        fluencyLevel: "B1",
        wordsPerMinute: {
          value: 120,
          emoji: "🚀",
          feedback: "Your speaking pace is good, but you can aim for a slightly faster pace to reach advanced fluency.",
          speedBarPercent: 75
        },
        fillerWords: {
          percentage: 5,
          feedback: "You used some filler words like 'um' and 'uh'. Try to reduce these for smoother speech."
        },
        hesitationsAndCorrections: {
          rate: 2,
          feedback: "You had a few hesitations. Practice pausing intentionally to gather thoughts."
        }
      },
      vocabulary: {
        vocabularyScore: 70,
        vocabularyLevel: "B1",
        activeVocabulary: 150,
        uniqueWords: 100,
        lexicalDiversity: {
          score: 65,
          feedback: "Your vocabulary diversity is moderate. Try incorporating more advanced words."
        },
        levelBreakdown: {
          A1: 50,
          A2: 30,
          B1: 15,
          B2: 5,
          C1: 0,
          C2: 0
        },
        wordSuggestions: {
          good: [
            { word: "excellent", level: "B2", definition: "Of the highest quality", color: "#60A5FA" },
            { word: "superb", level: "C1", definition: "Outstanding or impressive", color: "#34D399" }
          ]
        },
        exampleSentences: {
          excellent: "Your performance was excellent during the presentation.",
          superb: "The team delivered a superb result on the project."
        },
        idiomaticLanguage: {
          usedCorrectly: 2,
          missedOpportunities: 3,
          feedback: "You used some idioms correctly but missed opportunities to use phrases like 'hit the nail on the head'."
        }
      },
      grammar: {
        grammarScore: 80,
        grammarLevel: "B2",
        growthPoints: ["Subject-verb agreement", "Correct use of prepositions"],
        sentenceComplexity: {
          score: 70,
          feedback: "Your sentences are moderately complex. Try using more compound sentences."
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
        }
      },
      discourse: {
        discourseScore: 65,
        discourseLevel: "B1",
        cohesion: {
          score: 70,
          feedback: "You used some connectors well, but try adding more transitions like 'therefore'."
        },
        coherence: {
          score: 60,
          feedback: "Your ideas are mostly clear, but ensure your points are logically ordered."
        }
      },
      improvementTarget: {
        nextLevel: "B2",
        percentToNextLevel: 20
      }
    };

    const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
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

DATA QUALITY STANDARDS:
- If a section cannot be analyzed due to insufficient content, set it to null
- For fluency: calculate actual words per minute, identify filler words, and assess speech flow
- For vocabulary: count unique words, assess lexical diversity, and suggest improvements
- For grammar: identify ALL errors with specific examples from the transcript
- For discourse: analyze coherence and cohesion using actual conversation structure

The structure to use is exactly as in the following example (all fields required, types must match):
${JSON.stringify(SAMPLE_REPORT, null, 2)}

CRITICAL WARNING: The sample above is ONLY for showing the required JSON structure. DO NOT use any of its data, content, words, sentences, examples, or feedback. Analyze ONLY the transcript provided. Reference the user's actual words for examples and feedback. If a field cannot be filled due to insufficient data, set it to null.`;
    
    const userMessage = `COMPREHENSIVE ANALYSIS REQUEST: Analyze the conversation transcript below with maximum detail and accuracy. Provide complete analysis of all language aspects or clearly indicate when data is insufficient.

CRITICAL INSTRUCTIONS:
- Analyze ONLY the provided transcript - no external knowledge or assumptions
- For grammar errors: Find EVERY error in the transcript, not just examples
- For fluency: Calculate actual speaking pace, identify filler words, assess hesitations
- For vocabulary: Count unique words, assess diversity, suggest improvements
- For discourse: Analyze coherence and cohesion using actual conversation flow
- If any section lacks sufficient data for meaningful analysis, set it to null
- Use ONLY the user's actual words and sentences for examples and feedback
- Provide specific, actionable insights based on real speech patterns

TRANSCRIPT DATA FOR ANALYSIS:
${JSON.stringify(transcriptItems)}

ANALYSIS REQUIREMENTS:
1. Fluency Assessment:
   - Calculate actual words per minute from transcript
   - Identify filler words and hesitations
   - Assess speech flow and corrections
   - Provide specific feedback on speaking pace

2. Vocabulary Evaluation:
   - Count unique words and assess lexical diversity
   - Identify vocabulary level distribution
   - Suggest word improvements based on actual usage
   - Analyze idiomatic language usage

3. Grammar Analysis:
   - Find EVERY grammar error in the transcript
   - Categorize errors by type (articles, verb agreement, etc.)
   - Provide specific corrections with actual sentences
   - Assess sentence complexity and structure

4. Discourse Analysis:
   - Evaluate coherence and cohesion
   - Analyze conversation flow and organization
   - Assess use of connectors and transitions
   - Provide feedback on overall communication effectiveness

JSON OUTPUT RULES:
- Output ONLY valid JSON - no text before or after
- All numbers must be plain numbers (e.g., 75, not "75%")
- All strings must be properly quoted
- No trailing commas or syntax errors
- Use proper JSON syntax for all values
- For rates, use plain numbers (e.g., "rate": 5, not "rate": "5 per minute")
- For percentages, use plain numbers (e.g., "percentage": 20, not "percentage": "20%")
- For scores, use plain numbers (e.g., "score": 75, not "score": "75%")
- Use ONLY the provided transcript for analysis
- Reference specific words, phrases, and sentences from the transcript
- If insufficient data for analysis, set relevant fields to null
- Provide comprehensive, detailed analysis where possible
- Make feedback specific and actionable based on actual speech patterns
- Use user's actual words and sentences for all examples and feedback
- Ensure all emojis are quoted strings (e.g., "👍", "🐢", "🚀")
- Make the output personalized and specific to the user's actual speech
- DO NOT use any data from the sample structure - only use transcript data
- NEVER copy sample words, sentences, or feedback - use only transcript content

QUALITY ASSURANCE:
- Double-check all numerical calculations
- Ensure consistency between scores and feedback
- Verify all examples come from the actual transcript
- Confirm all required fields are present in the output
- Validate that feedback is specific and actionable
- Ensure no sample content is used in the analysis
- If transcript is too short or unclear, set relevant fields to null
- Provide realistic scores based on actual conversation quality
- Ensure all feedback is specific to the user's actual speech patterns`;

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const groqPayload = {
      model: SUPPORTED_MODELS.report || SUPPORTED_MODELS.fallback,
      messages: formattedMessages,
      temperature: 1,
      max_tokens: 4096,
    };

    const groqResponse = await axios.post(groqApiUrl, groqPayload, {
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!groqResponse.data.choices || !groqResponse.data.choices[0]) {
      throw new Error("No response from AI");
    }

    const contentString = groqResponse.data.choices[0].message.content;

    if (!contentString) {
      throw new Error("No content received from AI");
    }

    // Parse the AI response to extract JSON from markdown
    let jsonString = contentString;
    
    // Remove markdown code blocks if present
    if (contentString.includes('```json')) {
        jsonString = contentString.split('```json')[1] || jsonString;
    } else if (contentString.includes('```')) {
        jsonString = contentString.split('```')[1] || jsonString;
    }
    
    // Remove any leading text before the JSON
    const jsonStartIndex = jsonString.indexOf('{');
    if (jsonStartIndex > 0) {
        jsonString = jsonString.substring(jsonStartIndex);
    }
    
    // Remove any trailing text after the JSON
    const jsonEndIndex = jsonString.lastIndexOf('}');
    if (jsonEndIndex > 0 && jsonEndIndex < jsonString.length - 1) {
        jsonString = jsonString.substring(0, jsonEndIndex + 1);
    }
    
    // Clean up the JSON string
    jsonString = jsonString
        .replace(/\n/g, '') // Remove newlines
        .replace(/\/\/.*?(?=,|}|$)/g, '') // Remove comments
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .trim();
    
    try {
        const parsedData = JSON.parse(jsonString);
        
        // Basic validation that the AI provided meaningful data
        const hasValidData = parsedData && typeof parsedData === 'object' && 
            Object.values(parsedData).some(value => 
                value !== null && value !== undefined && 
                (typeof value === 'object' ? Object.values(value).some(v => v !== null && v !== undefined) : true)
            );
        
        // Additional validation for meaningful analysis
        const hasMeaningfulScores = parsedData && (
            (parsedData.fluency && parsedData.fluency.fluencyScore !== null) ||
            (parsedData.vocabulary && parsedData.vocabulary.vocabularyScore !== null) ||
            (parsedData.grammar && parsedData.grammar.grammarScore !== null) ||
            (parsedData.discourse && parsedData.discourse.discourseScore !== null)
        );
        
        if (!hasValidData || !hasMeaningfulScores) {
            throw new Error('insufficient conversation data');
        }
        
        return {
          success: true,
          data: parsedData
        };
    } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError, jsonString);
        throw new Error('AI returned malformed data');
    }

  } catch (error) {
    console.error('Error generating report:', error);
    throw new Error(error.message || 'Failed to generate report');
  }
};

// Generate quiz questions
const generateQuiz = async (transcriptItems) => {
  try {
    if (!transcriptItems || !Array.isArray(transcriptItems)) {
      throw new Error('Missing or invalid required field: transcriptItems (must be an array)');
    }

    // Validate transcript content
    const userMessages = transcriptItems.filter(
      (item) => item.role === 'user' && item.content
    );
    const totalUserWords = userMessages.reduce((total, message) => {
      const content = Array.isArray(message.content)
        ? message.content.join(' ')
        : message.content;
      return total + (content.split(/\s+/).filter((word) => word.length > 0).length || 0);
    }, 0);

    const meaningfulMessages = userMessages.filter((message) => {
      const content = Array.isArray(message.content)
        ? message.content.join(' ')
        : message.content;
      return content && content.trim().length > 5;
    });

    if (totalUserWords < 30 || meaningfulMessages.length < 2) {
      throw new Error('Insufficient conversation content for quiz generation.');
    }

    const groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    const systemPrompt = `You are an expert English tutor creating personalized quiz questions from the user's conversation. Your goal is to help the user improve their English by identifying real learning opportunities from their actual speech.

CRITICAL REQUIREMENTS:
1. Extract ONLY real sentences and words from the provided conversation transcript
2. Focus on common English mistakes that learners actually make
3. Create questions that teach valuable grammar, vocabulary, and pronunciation lessons
4. Make explanations educational and helpful for improvement
5. Return ONLY a valid JSON array with exactly 5 questions - no extra text, markdown, or formatting
6. If insufficient data for a specific question type, return null for that question's fields but maintain the array structure
7. Use ONLY the user's actual words, sentences, and speech patterns from the transcript
8. Never fabricate data or use hypothetical examples

QUIZ STRUCTURE - Create exactly 5 educational questions:
1. GRAMMAR-REPLACE: Find a sentence with a clear grammar error from the conversation
2. GRAMMAR-EXPLAIN: Identify a sentence with a grammar issue and explain why it's wrong
3. SYNONYM: Choose a meaningful word from the conversation that has good synonyms
4. PRONUNCIATION: Pick a commonly mispronounced word from the conversation
5. NATURAL-PHRASING: Find an awkward or unnatural expression from the conversation

OUTPUT FORMAT - Return ONLY this JSON array:

[
  {
    "type": "grammar-replace",
    "prompt": "Correct this sentence:",
    "sentence": "exact sentence with grammar error from conversation",
    "options": ["corrected version", "wrong option 1", "wrong option 2"],
    "correctAnswer": "corrected version",
    "explanation": "educational explanation of the grammar rule"
  },
  {
    "type": "grammar-explain",
    "prompt": "What's wrong here?",
    "sentence": "exact sentence with error from conversation",
    "options": ["specific grammar error", "wrong error 1", "wrong error 2"],
    "correctAnswer": "specific grammar error",
    "explanation": "why this grammar rule matters"
  },
  {
    "type": "synonym",
    "prompt": "Choose 2 synonyms for",
    "targetWord": "actual word from conversation",
    "options": ["correct synonym 1", "correct synonym 2", "wrong word 1", "wrong word 2"],
    "correctAnswers": ["correct synonym 1", "correct synonym 2"],
    "explanation": "nuance between the synonyms"
  },
  {
    "type": "pronunciation",
    "instruction": "You pronounced it as 'user-mispronunciation' — let's fix that!",
    "targetWord": {
      "text": "actual word from conversation",
      "phonetic": "correct phonetic spelling",
      "highlightColor": "#FF4C4C"
    },
    "userPronouncedAs": "",
    "context": "exact sentence containing the word",
    "score": 0,
    "retryEnabled": true
  },
  {
    "type": "natural-phrasing",
    "prompt": "Which sounds more natural?",
    "scenario": "context from conversation",
    "options": ["awkward version from conversation", "natural alternative"],
    "correctAnswer": "natural alternative",
    "explanation": "why the natural version is better"
  }
]

QUALITY STANDARDS:
- Use ONLY real sentences and words from the provided conversation
- Focus on common English learning challenges
- Make explanations educational and actionable
- Ensure questions provide genuine learning value
- If insufficient data for a question, set relevant fields to null but maintain array structure with 5 items
- For grammar questions, use actual sentences with errors from the transcript
- For pronunciation, select a word actually used that is commonly mispronounced
- For synonyms, pick a word actually used with viable synonyms
- For natural phrasing, identify an actual awkward phrase and suggest a real improvement
- Ensure all questions are based on the user's actual speech patterns
- Validate that all required fields are present and correctly formatted
- Use plain strings for all fields (no markdown or special characters except in phonetic field)
- Ensure explanations are specific to the user's actual mistakes or usage`;

    const userMessage = `Analyze this conversation transcript and create exactly 5 educational quiz questions to help the user improve their English. Focus on real sentences and words from their conversation that contain learning opportunities. If insufficient data for any question type, set relevant fields to null but maintain the array structure with 5 items.

TRANSCRIPT DATA FOR ANALYSIS:
${JSON.stringify(transcriptItems)}

ANALYSIS REQUIREMENTS:
1. GRAMMAR-REPLACE: Find a specific sentence with a clear grammar error; provide the corrected version and two plausible incorrect options
2. GRAMMAR-EXPLAIN: Identify a sentence with a grammar issue; explain the specific error and provide two incorrect error descriptions
3. SYNONYM: Select a meaningful word used in the conversation; provide two correct synonyms and two incorrect options
4. PRONUNCIATION: Choose a commonly mispronounced word from the conversation; include its phonetic spelling and the sentence it appeared in
5. NATURAL-PHRASING: Identify an awkward or unnatural expression; provide a natural alternative and the conversation context

JSON OUTPUT RULES:
- Output ONLY a valid JSON array with exactly 5 items
- No markdown, extra text, or comments
- All strings must be properly quoted
- No trailing commas or syntax errors
- Use plain strings for all fields (except phonetic field which may include slashes)
- Set fields to null if insufficient data (e.g., no grammar errors found)
- Use actual sentences and words from the transcript for all examples
- Ensure explanations are educational and specific to the user's speech
- Maintain the exact structure shown above
- Validate that all required fields are present
- Ensure questions target real learning opportunities from the transcript
- Do NOT fabricate data or use hypothetical examples
- If transcript is too short, set relevant fields to null but return 5 items
- Ensure all the fields are available and all the fields have the data otherwise our UI can break{!!IMPORTANT}
`;

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const groqPayload = {
      model: SUPPORTED_MODELS.quiz || SUPPORTED_MODELS.fallback,
      messages: formattedMessages,
      temperature: 1,
      max_tokens: 20000,
    };

    const groqResponse = await axios.post(groqApiUrl, groqPayload, {
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!groqResponse.data.choices || !groqResponse.data.choices[0]) {
      throw new Error("No response from AI");
    }

    const contentString = groqResponse.data.choices[0].message.content;

    if (!contentString) {
      throw new Error("No content received from AI");
    }

    // Parse JSON with careful handling to preserve content
    let jsonString = contentString;
    
    // Remove markdown code blocks if present
    if (jsonString.includes('```json')) {
      const parts = jsonString.split('```json');
      if (parts.length > 1) {
        jsonString = parts[1].split('```')[0];
      }
    } else if (jsonString.includes('```')) {
      const parts = jsonString.split('```');
      if (parts.length > 1) {
        jsonString = parts[1];
      }
    }
    
    // Find JSON array boundaries
    const startIndex = jsonString.indexOf('[');
    const endIndex = jsonString.lastIndexOf(']');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      throw new Error('AI returned malformed JSON - missing array structure');
    }
    jsonString = jsonString.substring(startIndex, endIndex + 1);
    
    // Minimal cleaning - only remove trailing commas, preserve content
    jsonString = jsonString.replace(/,([\s]*[\]}])/g, '$1').trim();

    let parsedData;
    try {
      parsedData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message, 'Raw:', jsonString);
      throw new Error('AI returned malformed JSON');
    }

    // Validate array structure
    if (!Array.isArray(parsedData) || parsedData.length !== 5) {
      throw new Error('AI did not return an array with exactly 5 questions');
    }

    return {
      success: true,
      data: parsedData,
    };
  } catch (error) {
    console.error('Error generating quiz:', error.message, error.stack);
    throw new Error(error.message || 'Failed to generate quiz');
  }
};

// Generate listening quiz
const generateListeningQuiz = async (conversation) => {
  try {
    if (!conversation || typeof conversation !== 'string') {
      throw new Error('Missing or invalid required field: conversation (must be a string)');
    }

    // Check for meaningful conversation content
    const totalWords = conversation.split(/\s+/).filter(word => word.length > 0).length;

    if (totalWords < 50) {
      throw new Error('Insufficient conversation content for listening quiz generation. Please provide a longer conversation.');
    }

    const groqApiUrl = "https://api.groq.com/openai/v1/chat/completions";
    const systemPrompt = `You are an expert English tutor creating listening comprehension quiz questions from the provided conversation. Your goal is to help the user improve their listening skills by testing their understanding of the actual conversation content.

CRITICAL REQUIREMENTS:
1. Use ONLY real content, quotes, and details from the provided conversation
2. Create questions that test genuine comprehension of what was said
3. Focus on important information that would be valuable to remember
4. Make questions challenging but fair - test understanding, not memory tricks
5. Return ONLY valid JSON array - no extra text or formatting

QUIZ STRUCTURE - Create exactly 5 comprehension questions:

1. LISTENING-COMPREHENSION: Test understanding of main conversation points
2. DETAIL-RECALL: Test memory of specific facts or details mentioned
3. SPEAKER-IDENTIFICATION: Test who said what using actual quotes
4. CONTEXT-INFERENCE: Test understanding of implied meaning
5. MAIN-IDEA: Test understanding of the conversation's central topic

OUTPUT FORMAT - Return ONLY this JSON object:

{
  "questions": [
    {
      "type": "listening-comprehension",
      "prompt": "Based on the conversation,",
      "question": "specific question about main content from conversation",
      "options": ["correct answer", "wrong option 1", "wrong option 2", "wrong option 3"],
      "correctAnswer": "correct answer"
    },
    {
      "type": "detail-recall",
      "prompt": "What specific detail was mentioned about",
      "question": "question about specific fact or detail from conversation",
      "options": ["correct detail", "wrong detail 1", "wrong detail 2", "wrong detail 3"],
      "correctAnswer": "correct detail"
    },
    {
      "type": "speaker-identification",
      "prompt": "Who said the following:",
      "question": "exact quote from the conversation",
      "options": ["actual speaker names from conversation"],
      "correctAnswer": "correct speaker name"
    },
    {
      "type": "context-inference",
      "prompt": "Based on the context,",
      "question": "question requiring understanding of implied meaning",
      "options": ["correct inference", "wrong inference 1", "wrong inference 2", "wrong inference 3"],
      "correctAnswer": "correct inference"
    },
    {
      "type": "main-idea",
      "prompt": "What is the main topic of this conversation?",
      "question": "question about the central theme or purpose",
      "options": ["correct main idea", "wrong idea 1", "wrong idea 2", "wrong idea 3"],
      "correctAnswer": "correct main idea"
    }
  ]
}

QUALITY STANDARDS:
- Use ONLY real content from the conversation
- Questions should test genuine comprehension skills
- Options should be plausible but clearly distinguishable
- Focus on information that would be valuable to remember
- No hypothetical questions - only based on actual conversation content`;

    const userMessage = `Analyze this conversation and create listening comprehension questions that will help the user improve their understanding of spoken English. Focus on real content, quotes, and details from the conversation: ${conversation}`;

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const groqPayload = {
      model: SUPPORTED_MODELS.quiz || SUPPORTED_MODELS.fallback,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { "type": "json_object" },
    };

    const groqResponse = await axios.post(groqApiUrl, groqPayload, {
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!groqResponse.data.choices || !groqResponse.data.choices[0]) {
      throw new Error("No response from AI");
    }

    const contentString = groqResponse.data.choices[0].message.content;

    if (!contentString) {
      throw new Error("No content received from AI");
    }

    // Parse and clean the JSON response
    let jsonString = contentString;

    // Remove markdown code blocks if present
    if (jsonString.includes('```json')) {
      jsonString = jsonString.split('```json')[1] || jsonString;
    } else if (jsonString.includes('```')) {
      jsonString = jsonString.split('```')[1] || jsonString;
    }

    // Remove any leading/trailing text
    const startIndex = jsonString.indexOf('{');
    const endIndex = jsonString.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      throw new Error('AI returned malformed JSON - missing object structure');
    }
    jsonString = jsonString.substring(startIndex, endIndex + 1);

    // Clean up the JSON string
    jsonString = jsonString
      .replace(/\n/g, '') // Remove newlines
      .replace(/\/\/.*?(?=,|]|})/g, '') // Remove comments
      .replace(/,(\s*[\]}])/g, '$1') // Remove trailing commas
      .trim();

    let parsedData;
    try {
      parsedData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, jsonString);
      throw new Error('AI returned malformed JSON');
    }

    // Validate the quiz structure
    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('AI response is not a valid object');
    }

    if (!parsedData.questions || !Array.isArray(parsedData.questions)) {
      throw new Error('AI response missing questions array');
    }

    if (parsedData.questions.length !== 5) {
      throw new Error(`Expected exactly 5 questions, got ${parsedData.questions.length}`);
    }

    return {
      success: true,
      data: parsedData.questions
    };

  } catch (error) {
    console.error('Error generating listening quiz:', error);
    throw new Error(error.message || 'Failed to generate listening quiz');
  }
};

module.exports = {
  generateRoleplay,
  generateReport,
  generateQuiz,
  generateListeningQuiz
};