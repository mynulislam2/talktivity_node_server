const express = require('express');
const router = express.Router();
const { getDailyReport, saveDailyReport } = require('../db');
const axios = require('axios');
const { authenticateToken } = require('./auth-routes');

// Get or generate daily report for a user
router.get('/:userId/:date', authenticateToken, async (req, res) => {
    try {
        const { userId, date } = req.params;

        // Validate inputs
        if (!userId || !date) {
            return res.status(400).json({
                success: false,
                message: 'User ID and date are required'
            });
        }

        // Check if report exists in database
        const existingReport = await getDailyReport(userId, date);

        if (existingReport) {
            console.log(`📊 Returning cached daily report for user ${userId} on ${date}`);
            return res.json({
                success: true,
                data: {
                    report: existingReport.report_data,
                    cached: true,
                    created_at: existingReport.created_at,
                    updated_at: existingReport.updated_at
                }
            });
        }

        // If no cached report, we need to generate one
        // This would typically require the conversation data
        // For now, we'll return a message indicating no cached report
        return res.json({
            success: false,
            message: 'No cached report found. Please generate a new report.',
            cached: false
        });

    } catch (error) {
        console.error('❌ Error getting daily report:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to retrieve daily report at this time. Please try again later.'
        });
    }
});

// GET /generate - Generate and save daily report (fetches data from database)
router.get('/generate', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { pool } = require('../db/index');

        // Get date from query params or use today's date
        const date = req.query.date || new Date().toISOString().split('T')[0];

        console.log(`🔄 Generating daily report for user ${userId} on ${date}`);

        // Check if report already exists
        const existingReport = await getDailyReport(userId, date);

        if (existingReport) {
            console.log(`📊 Returning existing cached report for user ${userId} on ${date}`);
            return res.json({
                success: true,
                data: {
                    report: existingReport.report_data,
                    cached: true,
                    created_at: existingReport.created_at,
                    updated_at: existingReport.updated_at
                }
            });
        }

        // Fetch conversations from database for the specified date
        // Use a range to ensure we catch sessions across timezone boundaries
        const startTime = new Date(`${date}T00:00:00Z`);
        const endTime = new Date(`${date}T23:59:59.999Z`);

        const conversationsResult = await pool.query(`
            SELECT id, room_name, user_id, timestamp, transcript 
            FROM conversations 
            WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
            ORDER BY timestamp ASC
        `, [userId, startTime, endTime]);

        const conversations = conversationsResult.rows;

        if (!conversations || conversations.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No conversations found for this date. Please complete some speaking sessions first.'
            });
        }

        // Parse transcript items from conversations
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
            return res.status(404).json({
                success: false,
                error: 'No valid transcript items found. Please complete some speaking sessions first.'
            });
        }

        console.log(`Found ${transcriptItems.length} transcript items for user ${userId} on ${date}. Generating report...`);

        // Generate new report using Groq API
        const groqResponse = await generateReportWithGroq(transcriptItems);

        if (!groqResponse.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to generate report',
                error: groqResponse.error
            });
        }

        // Save the generated report to database
        const savedReport = await saveDailyReport(userId, date, groqResponse.data);

        console.log(`✅ Daily report saved for user ${userId} on ${date}`);

        res.json({
            success: true,
            data: {
                report: groqResponse.data,
                cached: false,
                created_at: savedReport.created_at,
                updated_at: savedReport.updated_at
            }
        });

    } catch (error) {
        console.error('❌ Error generating daily report:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to generate daily report at this time. Please try again later.'
        });
    }
});



// Helper function to generate report using Groq API
const generateReportWithGroq = async (transcriptData, useFallback = false) => {
    try {
        const url = "https://api.groq.com/openai/v1/chat/completions";

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

        // Use environment variable for model, with fallback to reliable Groq models
        // Default to a current Groq-supported model
        const GROQ_MODEL_REPORT = process.env.GROQ_MODEL_REPORT || process.env.MODEL_REPORT || "llama-3.1-70b-versatile";
        const GROQ_MODEL_FALLBACK = process.env.GROQ_MODEL_FALLBACK || "llama-3.3-70b-versatile";

        // Use fallback model if requested (for retry scenarios)
        const modelToUse = useFallback ? GROQ_MODEL_FALLBACK : GROQ_MODEL_REPORT;

        if (useFallback) {
            console.log(`🔄 Retrying with fallback model: ${modelToUse}`);
        }

        const payload = {
            model: modelToUse,
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
            max_tokens: 32768, // Increased significantly to handle long reasoning responses
        };

        const headers = {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
        };

        const aiResponse = await axios.post(url, payload, {
            headers,
            timeout: 45000 // Increased timeout for more comprehensive analysis
        });

        // Log the full response for debugging if content is missing
        if (!aiResponse?.data?.choices?.[0]?.message?.content) {
            console.error('❌ Groq API Response Debug:', JSON.stringify({
                status: aiResponse.status,
                statusText: aiResponse.statusText,
                dataKeys: Object.keys(aiResponse.data || {}),
                choicesLength: aiResponse?.data?.choices?.length,
                firstChoice: aiResponse?.data?.choices?.[0],
                error: aiResponse?.data?.error,
                fullResponse: JSON.stringify(aiResponse.data, null, 2).substring(0, 1000) // First 1000 chars
            }, null, 2));
        }

        const choice = aiResponse?.data?.choices?.[0];
        let contentString = choice?.message?.content;

        // Check finish_reason - if it's "length", the response was truncated
        const finishReason = choice?.finish_reason;
        if (finishReason === "length") {
            console.warn(`⚠️ Response truncated (max_tokens reached). Consider increasing max_tokens or using a different model.`);
        }

        // If content is empty but Groq returned reasoning, try to extract JSON from reasoning
        if ((!contentString || contentString.length === 0) && typeof choice?.message?.reasoning === "string") {
            const reasoningText = choice.message.reasoning;
            console.log(`📝 Using reasoning field (${reasoningText.length} chars). Attempting to extract JSON...`);

            // Try to find JSON in the reasoning text
            // Look for JSON object starting with {
            const jsonMatch = reasoningText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                contentString = jsonMatch[0];
                console.log(`✅ Extracted JSON from reasoning field (${contentString.length} chars)`);
            } else {
                // If no JSON found, use the reasoning text as-is and try to parse it
                contentString = reasoningText;
                console.warn(`⚠️ No JSON found in reasoning field, attempting to parse reasoning text directly`);
            }
        }

        // Some Groq/OpenAI-compatible responses may return content as an array of parts
        if (Array.isArray(contentString)) {
            contentString = contentString
                .map((part) => {
                    if (!part) return "";
                    // Groq often uses { type: 'text', text: '...' }
                    if (typeof part === "string") return part;
                    if (typeof part.text === "string") return part.text;
                    if (typeof part.content === "string") return part.content;
                    return "";
                })
                .join("\n")
                .trim();
        }

        // Fallback: sometimes the SDK may put the text directly on message
        if (!contentString && typeof choice?.message === "string") {
            contentString = choice.message;
        }

        // Check for finish_reason that might indicate why content is missing
        if (!contentString) {
            const finishReason = choice?.finish_reason;
            const apiErrorMessage =
                aiResponse?.data?.error?.message ||
                aiResponse?.data?.error ||
                null;

            let errorMsg = "No content received from AI";
            if (finishReason === "length") {
                errorMsg = "AI response was truncated (max_tokens reached). Consider increasing max_tokens.";
                // If truncated and using reasoning model, suggest fallback
                if (modelToUse.includes("reasoning") || modelToUse.includes("gpt-oss")) {
                    console.warn(`⚠️ Reasoning model response truncated. Consider using a non-reasoning model like 'llama-3.3-70b-versatile' or 'llama-3.1-70b-versatile'`);
                }
            } else if (finishReason === "content_filter") {
                errorMsg = "AI response was filtered by content policy.";
            } else if (finishReason === "stop") {
                errorMsg = "AI stopped generating (stop token reached).";
            } else if (apiErrorMessage) {
                errorMsg = `Groq API returned error: ${apiErrorMessage}`;
            } else if (finishReason) {
                errorMsg = `No content received from AI. Finish reason: ${finishReason}`;
            }

            console.error(`❌ Groq API Error Details:`, {
                finishReason,
                apiErrorMessage,
                choice: choice ? Object.keys(choice) : 'no choice',
                message: choice?.message ? Object.keys(choice.message) : 'no message'
            });

            throw new Error(errorMsg);
        }

        // Parse the AI response to extract JSON
        let jsonString = contentString;

        // Remove markdown code blocks if present
        if (contentString.includes('```json')) {
            jsonString = contentString.split('```json')[1]?.split('```')[0] || contentString;
        } else if (contentString.includes('```')) {
            jsonString = contentString.split('```')[1]?.split('```')[0] || contentString;
        }

        // Remove any leading text before the JSON
        const jsonStartIndex = jsonString.indexOf('{');
        if (jsonStartIndex > 0) {
            jsonString = jsonString.substring(jsonStartIndex);
        }

        // For truncated responses, try to find the last complete JSON object
        // Count braces to find where the JSON might be complete
        let braceCount = 0;
        let lastValidIndex = -1;
        for (let i = 0; i < jsonString.length; i++) {
            if (jsonString[i] === '{') braceCount++;
            if (jsonString[i] === '}') braceCount--;
            if (braceCount === 0 && i > 0) {
                lastValidIndex = i;
            }
        }

        // If we found a complete JSON object, use it
        if (lastValidIndex > 0) {
            jsonString = jsonString.substring(0, lastValidIndex + 1);
        } else {
            // Otherwise, try to find the last closing brace
            const jsonEndIndex = jsonString.lastIndexOf('}');
            if (jsonEndIndex > 0) {
                jsonString = jsonString.substring(0, jsonEndIndex + 1);
            }
        }

        // Clean up the JSON string
        jsonString = jsonString
            .replace(/\n/g, ' ') // Replace newlines with spaces (don't remove completely)
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
            console.error('Failed to parse AI response as JSON:', parseError.message);
            console.error('JSON string length:', jsonString?.length);
            console.error('JSON string preview (first 500 chars):', jsonString?.substring(0, 500));

            // If using a reasoning model and it failed, suggest alternative
            if (modelToUse.includes("reasoning") || modelToUse.includes("gpt-oss")) {
                console.error(`💡 Suggestion: The reasoning model (${modelToUse}) may not be suitable for JSON output. Consider using 'llama-3.3-70b-versatile' or 'llama-3.1-70b-versatile' instead.`);
            }

            throw new Error(`AI analysis failed: ${parseError.message}`);
        }

    } catch (error) {
        console.error("Groq API Error:", error.message);

        // If we haven't tried the fallback model yet, retry with it
        if (!useFallback && (error.message.includes('truncated') || error.message.includes('parse') || error.message.includes('JSON'))) {
            console.log(`🔄 Primary model failed, retrying with fallback model...`);
            return generateReportWithGroq(transcriptData, true);
        }

        return { success: false, error: error.message || 'AI analysis failed' };
    }
};

module.exports = router; 