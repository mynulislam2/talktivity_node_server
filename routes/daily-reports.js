const express = require('express');
const router = express.Router();
const { getDailyReport, saveDailyReport } = require('../db');
const axios = require('axios');

// Get or generate daily report for a user
router.get('/:userId/:date', async (req, res) => {
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
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Generate and save daily report
router.post('/generate', async (req, res) => {
    try {
        const { userId, date, transcriptData } = req.body;
        
        // Validate inputs
        if (!userId || !date || !transcriptData) {
            return res.status(400).json({
                success: false,
                message: 'User ID, date, and transcript data are required'
            });
        }

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

        // Generate new report using Groq API
        console.log(`🔄 Generating new daily report for user ${userId} on ${date}`);
        
        const groqResponse = await generateReportWithGroq(transcriptData);
        
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
            message: 'Internal server error',
            error: error.message
        });
    }
});



// Helper function to generate report using Groq API
const generateReportWithGroq = async (transcriptData, retryCount = 0) => {
    try {
        const url = "https://api.groq.com/openai/v1/chat/completions";
        
        // Sample report structure for the AI to follow - EXACTLY matching the original report page
        const SAMPLE_REPORT = {
            "pronunciation": {
                "pronunciationScore": 24,
                "pronunciationLevel": "A2",
                "improvementTarget": {
                    "percentToNextLevel": 6,
                    "nextLevel": "B1"
                },
                "accentType": "HEAVY ACCENT",
                "accentDescription": "Your pronunciation shows influences from Indian languages, particularly in words like 'development' and 'project'.",
                "improvementDescription": "Practice sounds /r/ and /v/. Focus on problematic consonants and mimic native stress and intonation.",
                "soundChallenges": {
                    "/r/": [
                        {
                            "word": "project",
                            "accuracy": 18,
                            "tip": "Place your tongue behind the top teeth; avoid rolling the 'r'."
                        },
                        {
                            "word": "question",
                            "accuracy": 68,
                            "tip": "Use a softer 'r' sound — avoid rolling."
                        }
                    ],
                    "/v/": [
                        {
                            "word": "development",
                            "accuracy": 31,
                            "tip": "Use your upper teeth against your lower lip."
                        },
                        {
                            "word": "involved",
                            "accuracy": 42,
                            "tip": "Emphasize the 'v' clearly, not like 'w'."
                        }
                    ]
                },
                "intonationAndRhythm": {
                    "score": 52,
                    "feedback": "Your speech tends to be flat. Try to emphasize key words and use rising intonation for questions, e.g., 'Are you ready?'"
                }
            },
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

        const payload = {
            model: "llama3-8b-8192",
            messages: [
                {
                    role: "system",
                    content: `You are a world-class English language assessment AI. Your ONLY job is to analyze the provided conversation transcript and return a JSON object that matches the required structure.

CRITICAL RULES - READ CAREFULLY:
1. Analyze ONLY the conversation transcript provided by the user
2. DO NOT use any data from the sample structure below - it's ONLY for showing the required JSON format
3. DO NOT use any general knowledge, previous conversations, or external data
4. Base your analysis EXCLUSIVELY on the user's actual words and sentences from the transcript
5. For grammar errors, find EVERY error in the transcript, not just examples
6. Use the user's actual sentences for examples and feedback
7. If the transcript is too short or unclear, indicate this in your analysis
8. NEVER copy or adapt any content from the sample structure below
9. NEVER use the sample words, sentences, or examples in your response
10. NEVER use the sample feedback or descriptions in your response

ABSOLUTE FORBIDDEN ACTIONS:
- DO NOT copy any words, sentences, or examples from the sample structure
- DO NOT adapt or modify sample content for your response
- DO NOT use sample grammar errors, pronunciation words, or feedback
- DO NOT use sample scores, levels, or descriptions
- DO NOT use any part of the sample data as a template

You must:
- Output ONLY a valid JSON object (no markdown, no extra text)
- Include ALL required fields, even if null
- Use correct types (numbers, strings, objects, arrays)
- Not omit or rename any fields
- Not add any extra fields
- Use user's actual words for examples/feedback
- If a section is missing, set it to null (do not omit)
- No explanations, disclaimers, or markdown
- All numbers must be plain numbers (not strings with units)
- All strings must be properly quoted
- No trailing commas
- Use proper JSON syntax for all values
- For rates, use plain numbers (e.g., "rate": 5, not "rate": "5 per minute")
- For percentages, use plain numbers (e.g., "percentage": 20, not "percentage": "20%")
- For scores, use plain numbers (e.g., "score": 75, not "score": "75%")
- If the transcript is too short, indicate this in your analysis
- The output must be directly parsable as JSON
- If you cannot fill a field, set it to null (do not omit)
- DO NOT include any text before or after the JSON object
- DO NOT use markdown code blocks
- DO NOT analyze this structure, just fill it
- DO NOT use any data except the transcript provided
- DO NOT use general knowledge or previous conversations
- DO NOT add any extra commentary
- DO NOT change field names or structure
- DO NOT add or remove any fields
- DO NOT wrap the output in markdown
- DO NOT output anything except the JSON object
- If you break any of these rules, the system will fail

The structure to use is exactly as in the following example (all fields required, types must match):
${JSON.stringify(SAMPLE_REPORT, null, 2)}

CRITICAL WARNING: The sample above is ONLY for showing the required JSON structure. DO NOT use any of its data, content, words, sentences, examples, or feedback. Analyze ONLY the transcript provided. Reference the user's actual words for examples and feedback. If a field cannot be filled, set it to null. If the transcript is too short, indicate this in your analysis.`
                },
                {
                    role: "user",
                    content: `CRITICAL INSTRUCTIONS: Analyze ONLY the conversation transcript I provide below. Do NOT use any other data, previous conversations, or general knowledge. Base your analysis EXCLUSIVELY on this specific conversation.

ABSOLUTE FORBIDDEN: The sample report structure I showed you is ONLY for the JSON format - DO NOT use any of its data, examples, content, words, sentences, or feedback. Use ONLY the transcript data below.

CRITICAL WARNING: If you use any words, sentences, examples, or feedback from the sample structure, your response will be rejected and you will need to retry. Only use the actual transcript data provided below.

For the 'grammarErrors' field, you MUST return EVERY grammar error for EVERY sentence in the transcript, not just a sample. Be exhaustive and detailed. For each error, provide the category, the user's actual sentence, the correction, and a brief explanation. Do not skip any errors. For all other sections, provide the most detailed, specific, and actionable analysis possible, referencing the user's actual words and sentences. Do not summarize or generalize—be as granular as possible.

Here is the transcript of my latest conversation: ${JSON.stringify(transcriptData)}

*CRITICAL JSON RULES:*
- Output ONLY valid JSON - no text before or after
- All numbers must be plain numbers (e.g., 5, not "5 per minute")
- All strings must be properly quoted
- No trailing commas
- Use proper JSON syntax for all values
- For rates, use plain numbers (e.g., "rate": 5, not "rate": "5 per minute")
- For percentages, use plain numbers (e.g., "percentage": 20, not "percentage": "20%")
- For scores, use plain numbers (e.g., "score": 75, not "score": "75%")
- Use ONLY the provided transcript for analysis - nothing else
- Reference specific words, phrases, and sentences from the transcript
- Do NOT include explanations, disclaimers, or markdown
- Provide data in all required objects
- Be specific and actionable in feedback
- If the transcript is too short, indicate this in your analysis
- Please analyze only the user's words and sentences from the transcript
- Please make sure you give the example sentence or anything else use the user's actual words and sentences
- Always give the data type and the structure as I said
- Don't ever give any extra text or anything else just directly the JSON
- Please when you give emoji give as string like this: "👍" or "🐢" or "🚀" . see here it wrapped with double quotes
- For example and feedback and suggestion or anything where you need some word or sentence use the user's actual words and sentences from the transcript
- Make the output personalized and specific to the user's words and sentences
- DO NOT use any data from the sample structure - only use the transcript data above
- NEVER copy sample words like "development", "project", "question", "involved"
- NEVER copy sample sentences like "I have plan for it", "I will explain you the idea"
- NEVER copy sample feedback like "Indian languages", "heavy accent", "practice sounds /r/ and /v/"

`
                }
            ],
            temperature: 1,
            max_tokens: 3048,
        };

        const headers = {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
        };

        const aiResponse = await axios.post(url, payload, {
            headers,
            timeout: 30000 // 30 second timeout for AI
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
            return { success: true, data: parsedData };
        } catch (parseError) {
            console.error('Failed to parse AI response as JSON:', parseError, jsonString);
            throw new Error('AI returned malformed data');
        }

    } catch (error) {
        console.error("Groq API Error:", error);
        return { success: false, error: error.message };
    }
};

module.exports = router; 