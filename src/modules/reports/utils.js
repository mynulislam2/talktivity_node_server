// src/modules/reports/utils.js
// Reports utility functions

const axios = require('axios');
const { config } = require('../../config');

// Sample report structure for the AI to follow - EXACTLY matching the original report page
const SAMPLE_REPORT = {
  "fluency": {
    "fluencyScore": 59,
    "fluencyLevel": "B2",
    "improvementTarget": {
      "percentToNextLevel": 11,
      "nextLevel": "C1"
    },
    "fillerWords": {
      "percentage": 3,
      "feedback": "You use filler words occasionally. Replace them with pauses for better clarity.",
      "topFillers": {
        "actually": 3,
        "try": 2,
        "okay": 2
      }
    },
    "wordsPerMinute": {
      "value": 101,
      "emoji": "👍",
      "feedback": "This is a good speaking pace. Try slight variation for emphasis.",
      "speedBarPercent": 60
    },
    "hesitationsAndCorrections": {
      "rate": 4,
      "feedback": "You made some mid-sentence corrections and pauses. Practice speaking in longer chunks to improve flow."
    }
  },
  "vocabulary": {
    "vocabularyScore": 49,
    "vocabularyLevel": "B1",
    "improvementTarget": {
      "percentToNextLevel": 1,
      "nextLevel": "B2"
    },
    "activeVocabulary": 1897,
    "uniqueWords": 48,
    "lexicalDiversity": {
      "score": 0.39,
      "feedback": "Your word variety is decent, but you repeat simpler terms. Try using more synonyms."
    },
    "levelBreakdown": {
      "A1": 48,
      "A2": 23,
      "B1": 13,
      "B2": 10,
      "C1": 2,
      "C2": 4
    },
    "wordSuggestions": {
      "good": [
        {
          "word": "skilled",
          "level": "B2",
          "color": "#4CAF50",
          "definition": "Having the ability and experience to do something well."
        },
        {
          "word": "proficient",
          "level": "C1",
          "color": "#2196F3",
          "definition": "Highly skilled or competent in a subject or activity."
        }
      ],
      "happy": [
        {
          "word": "delighted",
          "level": "B2",
          "color": "#FFC107",
          "definition": "Feeling or showing great pleasure."
        },
        {
          "word": "thrilled",
          "level": "C1",
          "color": "#FF9800",
          "definition": "Extremely pleased or excited."
        }
      ]
    },
    "exampleSentences": {
      "good": "He is a good developer.",
      "happy": "I am happy to be here."
    },
    "idiomaticLanguage": {
      "usedCorrectly": 1,
      "missedOpportunities": 3,
      "feedback": "You rarely used idioms. For example, instead of 'I'm very tired', you could say 'I'm worn out.'"
    }
  },
  "grammar": {
    "grammarScore": 25,
    "grammarLevel": "A2",
    "improvementTarget": {
      "percentToNextLevel": 5,
      "nextLevel": "B1"
    },
    "growthPoints": [
      "Articles",
      "Subject-Verb Agreement",
      "Phrasal Verbs"
    ],
    "improvementDescription": "Review article usage and subject-verb agreement rules. Practice using common phrasal verbs in context.",
    "grammarErrors": {
      "Articles": [
        {
          "description": "Use 'a' or 'an' before singular countable nouns.",
          "incorrectSentence": "I have plan for it.",
          "correctedSentence": "I have a plan for it."
        }
      ],
      "Subject-Verb Agreement": [
        {
          "description": "The subject and verb must agree in number.",
          "incorrectSentence": "how they are it is evolving",
          "correctedSentence": "how it is evolving"
        }
      ],
      "Phrasal Verbs": [
        {
          "description": "'Explain' needs a preposition when followed by a person.",
          "incorrectSentence": "I will explain you the idea",
          "correctedSentence": "I will explain the idea to you"
        }
      ]
    },
    "sentenceComplexity": {
      "score": 45,
      "feedback": "Most of your sentences are simple. Try combining clauses and using relative pronouns like 'which' or 'that'."
    }
  },
  "discourse": {
    "discourseScore": 51,
    "discourseLevel": "B1",
    "improvementTarget": {
      "percentToNextLevel": 7,
      "nextLevel": "B2"
    },
    "cohesion": {
      "score": 56,
      "feedback": "You used basic connectors like 'and', 'but'. Use transitions like 'however', 'on the other hand', and 'in contrast'."
    },
    "coherence": {
      "score": 53,
      "feedback": "Ideas are mostly clear, but organization could improve. Use structured outlines like: introduction > point > example > conclusion."
    }
  }
};

// Helper function to generate report using Groq API
const generateReportWithGroq = async (transcriptData, retryCount = 0) => {
  try {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    
    const payload = {
      model: "deepseek-r1-distill-llama-70b",
      messages: [
        {
          role: "system",
          content: `You are a world-class English language assessment AI specializing in comprehensive conversation analysis. Your task is to analyze the provided conversation transcript and generate a detailed, accurate report.

CRITICAL ANALYSIS REQUIREMENTS:
1. Analyze ONLY the conversation transcript provided - no external data or assumptions
2. Provide COMPREHENSIVE analysis of ALL aspects: fluency, vocabulary, grammar, and discourse
3. For EVERY field in the report structure, provide meaningful data or set to null if insufficient information
4. Use ONLY the user's actual words, sentences, and speech patterns from the transcript
5. NEVER copy or adapt content from the sample structure - it's only for format reference
6. If the transcript lacks sufficient content for analysis, clearly indicate this and set relevant fields to null
7. Be exhaustive in grammar error detection - find EVERY error in the transcript
8. Provide specific, actionable feedback based on actual user speech patterns
9. Ensure all numerical values are accurate and based on transcript analysis
10. Maintain consistency between scores, levels, and feedback across all sections

DATA QUALITY STANDARDS:
- If a section cannot be analyzed due to insufficient content, set it to null
- For fluency: calculate actual words per minute, identify filler words, and assess speech flow
- For vocabulary: count unique words, assess lexical diversity, and suggest improvements
- For grammar: identify ALL errors with specific examples from the transcript
- For discourse: analyze coherence and cohesion using actual conversation structure

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the exact structure provided
- Include ALL required fields - never omit fields, use null for missing data
- Use correct data types: numbers for scores/percentages, strings for text, objects for complex data
- Ensure all strings are properly quoted
- No trailing commas or syntax errors
- No markdown formatting or extra text
- All emojis must be quoted strings (e.g., "👍", "🐢", "🚀")

ERROR HANDLING:
- If transcript is too short (< 30 words), indicate insufficient data and set fields to null
- If specific analysis is not possible, provide null values with clear reasoning
- Never fabricate data or use sample content as fallback
- Always prioritize accuracy over completeness
- If conversation lacks meaningful content, provide null values rather than generic analysis
- Ensure all numerical scores are realistic and based on actual transcript analysis

The structure to use is exactly as in the following example (all fields required, types must match):
${JSON.stringify(SAMPLE_REPORT, null, 2)}

CRITICAL WARNING: The sample above is ONLY for showing the required JSON structure. DO NOT use any of its data, content, words, sentences, examples, or feedback. Analyze ONLY the transcript provided. Reference the user's actual words for examples and feedback. If a field cannot be filled due to insufficient data, set it to null.`
        },
        {
          role: "user",
          content: `COMPREHENSIVE ANALYSIS REQUEST: Analyze the conversation transcript below with maximum detail and accuracy. Provide complete analysis of all language aspects or clearly indicate when data is insufficient.

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
${JSON.stringify(transcriptData)}

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
- Ensure all feedback is specific to the user's actual speech patterns`
        }
      ],
      temperature: 1,
      max_tokens: 4096,
    };

    const headers = {
      Authorization: `Bearer ${config.groq.apiKey}`,
      "Content-Type": "application/json",
    };

    const aiResponse = await axios.post(url, payload, {
      headers,
      timeout: 45000 // Increased timeout for more comprehensive analysis
    });

    const contentString = aiResponse?.data?.choices?.[0]?.message?.content;
    if (!contentString) {
      throw new Error("No content received from AI");
    }

    // Parse the AI response to extract JSON
    let jsonString = contentString;
    
    // Remove markdown code blocks if present
    if (contentString.includes('```json')) {
      jsonString = contentString.split('```json')[1]?.split('```')[0] || contentString;
    } else if (contentString.includes('```')) {
      jsonString = contentString.split('```')[1] || contentString;
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
      
      // Validate that the AI provided meaningful data
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
      
      return { success: true, data: parsedData };
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, jsonString);
      throw new Error('AI analysis failed');
    }

  } catch (error) {
    console.error("Groq API Error:", error);
    return { success: false, error: 'AI analysis failed' };
  }
};

module.exports = {
  generateReportWithGroq
};