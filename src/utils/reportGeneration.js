/**
 * Report Generation Utility
 * Extracted from routes/daily-reports.js
 * Uses Groq API to generate comprehensive language learning reports
 */

const axios = require('axios');

const generateReportWithGroq = async (transcriptData, useFallback = false) => {
    try {
        const url = "https://api.groq.com/openai/v1/chat/completions";

        // Sample report structure for the AI to follow
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
                        }
                    ]
                },
                "exampleSentences": {
                    "good": "He is a good developer."
                },
                "idiomaticLanguage": {
                    "usedCorrectly": 1,
                    "missedOpportunities": 3,
                    "feedback": "You rarely used idioms."
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
                "improvementDescription": "Review article usage and subject-verb agreement rules.",
                "grammarErrors": {
                    "Articles": [
                        {
                            "description": "Use 'a' or 'an' before singular countable nouns.",
                            "incorrectSentence": "I have plan for it.",
                            "correctedSentence": "I have a plan for it."
                        }
                    ]
                },
                "sentenceComplexity": {
                    "score": 45,
                    "feedback": "Most of your sentences are simple."
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
                    "feedback": "You used basic connectors."
                },
                "coherence": {
                    "score": 53,
                    "feedback": "Ideas are mostly clear."
                }
            }
        };

        // Use environment variable for model, with fallback to reliable Groq models
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
                    content: `You are a world-class English language assessment AI. Analyze the provided conversation transcript and generate a detailed, accurate report.

CRITICAL ANALYSIS REQUIREMENTS:
1. Analyze ONLY the conversation transcript provided
2. Provide COMPREHENSIVE analysis of ALL aspects: fluency, vocabulary, grammar, and discourse
3. For EVERY field in the report structure, provide meaningful data or set to null if insufficient
4. Use ONLY the user's actual words, sentences, and speech patterns from the transcript
5. NEVER copy or adapt content from the sample structure - it's only for format reference
6. If the transcript lacks sufficient content for analysis, clearly indicate this and set relevant fields to null
7. Be exhaustive in grammar error detection - find EVERY error in the transcript
8. Provide specific, actionable feedback based on actual user speech patterns
9. Ensure all numerical values are accurate and based on transcript analysis
10. Maintain consistency between scores, levels, and feedback across all sections

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the exact structure provided
- Include ALL required fields - never omit fields, use null for missing data
- Use correct data types: numbers for scores/percentages, strings for text, objects for complex data
- Ensure all strings are properly quoted
- No trailing commas or syntax errors
- All emojis must be quoted strings (e.g., "👍")

The structure to use is exactly as in the following example (all fields required):
${JSON.stringify(SAMPLE_REPORT, null, 2)}`
                },
                {
                    role: "user",
                    content: `Analyze the conversation transcript below with maximum detail and accuracy. Provide complete analysis of all language aspects or clearly indicate when data is insufficient.

TRANSCRIPT DATA FOR ANALYSIS:
${JSON.stringify(transcriptData)}`
                }
            ],
            temperature: 1,
            max_tokens: 32768,
        };

        const headers = {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
        };

        const aiResponse = await axios.post(url, payload, {
            headers,
            timeout: 45000
        });

        if (!aiResponse?.data?.choices?.[0]?.message?.content) {
            console.error('❌ Groq API Response Debug:', JSON.stringify({
                status: aiResponse.status,
                statusText: aiResponse.statusText,
                dataKeys: Object.keys(aiResponse.data || {}),
                choicesLength: aiResponse?.data?.choices?.length,
                firstChoice: aiResponse?.data?.choices?.[0],
                error: aiResponse?.data?.error,
                fullResponse: JSON.stringify(aiResponse.data, null, 2).substring(0, 1000)
            }, null, 2));
        }

        const choice = aiResponse?.data?.choices?.[0];
        let contentString = choice?.message?.content;

        const finishReason = choice?.finish_reason;
        if (finishReason === "length") {
            console.warn(`⚠️ Response truncated (max_tokens reached).`);
        }

        if ((!contentString || contentString.length === 0) && typeof choice?.message?.reasoning === "string") {
            const reasoningText = choice.message.reasoning;
            console.log(`📝 Using reasoning field (${reasoningText.length} chars).`);

            const jsonMatch = reasoningText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                contentString = jsonMatch[0];
                console.log(`✅ Extracted JSON from reasoning field`);
            } else {
                contentString = reasoningText;
                console.warn(`⚠️ No JSON found in reasoning field`);
            }
        }

        if (Array.isArray(contentString)) {
            contentString = contentString
                .map((part) => {
                    if (!part) return "";
                    if (typeof part === "string") return part;
                    if (typeof part.text === "string") return part.text;
                    if (typeof part.content === "string") return part.content;
                    return "";
                })
                .join("\n")
                .trim();
        }

        if (!contentString && typeof choice?.message === "string") {
            contentString = choice.message;
        }

        if (!contentString) {
            const finishReason = choice?.finish_reason;
            const apiErrorMessage = aiResponse?.data?.error?.message || aiResponse?.data?.error || null;

            let errorMsg = "No content received from AI";
            if (finishReason === "length") {
                errorMsg = "AI response was truncated (max_tokens reached).";
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

        let jsonString = contentString;

        if (contentString.includes('```json')) {
            jsonString = contentString.split('```json')[1]?.split('```')[0] || contentString;
        } else if (contentString.includes('```')) {
            jsonString = contentString.split('```')[1]?.split('```')[0] || contentString;
        }

        const jsonStartIndex = jsonString.indexOf('{');
        if (jsonStartIndex > 0) {
            jsonString = jsonString.substring(jsonStartIndex);
        }

        let braceCount = 0;
        let lastValidIndex = -1;
        for (let i = 0; i < jsonString.length; i++) {
            if (jsonString[i] === '{') braceCount++;
            if (jsonString[i] === '}') braceCount--;
            if (braceCount === 0 && i > 0) {
                lastValidIndex = i;
            }
        }

        if (lastValidIndex > 0) {
            jsonString = jsonString.substring(0, lastValidIndex + 1);
        } else {
            const jsonEndIndex = jsonString.lastIndexOf('}');
            if (jsonEndIndex > 0) {
                jsonString = jsonString.substring(0, jsonEndIndex + 1);
            }
        }

        jsonString = jsonString
            .replace(/\n/g, ' ')
            .replace(/\/\/.*?(?=,|}|$)/g, '')
            .replace(/,(\s*[}\]])/g, '$1')
            .trim();

        try {
            const parsedData = JSON.parse(jsonString);

            const hasValidData = parsedData && typeof parsedData === 'object' &&
                Object.values(parsedData).some(value =>
                    value !== null && value !== undefined &&
                    (typeof value === 'object' ? Object.values(value).some(v => v !== null && v !== undefined) : true)
                );

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

            throw new Error(`AI analysis failed: ${parseError.message}`);
        }

    } catch (error) {
        console.error("Groq API Error:", error.message);

        if (!useFallback && (error.message.includes('truncated') || error.message.includes('parse') || error.message.includes('JSON'))) {
            console.log(`🔄 Primary model failed, retrying with fallback model...`);
            return generateReportWithGroq(transcriptData, true);
        }

        return { success: false, error: error.message || 'AI analysis failed' };
    }
};

module.exports = { generateReportWithGroq };
