/**
 * Reports Module Service - POSTMAN ALIGNED
 * Extracted from routes/report-routes.js and routes/daily-reports.js
 * Manages report generation and completion tracking
 * 
 * Removed orphaned methods: markReportCompleted(), getReportCompletionStatus(),
 * generateReportFromLatestConversation(), getUserReports(), getReportById(),
 * getReportStatistics(), deleteReport(), generateConversationReport(),
 * generateReportFromLatestConversationGroq()
 */

const axios = require('axios');
const db = require('../../core/db/client');
const llmService = require('../../core/llm/llmService');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

const reportsService = {
  /**
   * Generate report for ALL call session conversations
   * Collects all conversations, sends to Groq, validates response, and returns structured report
   */
  async generateCallReport(userId) {
    const client = await db.pool.connect();
    try {
      // Get ALL conversations for this user (not just completed ones)
      const conversationsResult = await client.query(
        `SELECT id, transcript, timestamp, session_duration, room_name
         FROM conversations 
         WHERE user_id = $1 
         ORDER BY timestamp ASC`,
        [userId]
      );

      if (!conversationsResult.rows || conversationsResult.rows.length === 0) {
        throw new ValidationError('No conversations found. Please complete a call session first.');
      }

      const conversations = conversationsResult.rows;
      console.log(`Found ${conversations.length} conversations for user ${userId}. Processing transcripts...`);

      // Parse and collect all transcript items from all conversations
      const allTranscriptItems = [];
      
      for (const conversation of conversations) {
        try {
          const parsed = JSON.parse(conversation.transcript);
          const items = (parsed.items || []).filter((item) => {
            // Ensure item has required fields and valid structure
            return item.role === 'user' && item.content;
          }).map((item) => {
            // Normalize content: if it's an array, join it; if it's a string, use it
            let normalizedContent = item.content;
            if (Array.isArray(item.content)) {
              // Join array of strings into a single string
              normalizedContent = item.content.filter(c => typeof c === 'string').join(' ');
            } else if (typeof item.content !== 'string') {
              // Convert to string if it's not already
              normalizedContent = String(item.content);
            }
            
            // Return normalized item
            return {
              role: item.role,
              content: normalizedContent,
              // Preserve other fields if they exist
              ...(item.id && { id: item.id }),
              ...(item.timestamp && { timestamp: item.timestamp }),
            };
          }).filter((item) => item.content && item.content.trim().length > 0); // Filter out empty content
          
          // Log sample item for debugging (first conversation only)
          if (items.length > 0 && allTranscriptItems.length === 0) {
            console.log(`[Reports] Sample transcript item from conversation ${conversation.id}:`, {
              role: items[0].role,
              contentPreview: items[0].content?.substring(0, 100),
              contentLength: items[0].content?.length
            });
          }
          
          allTranscriptItems.push(...items);
        } catch (error) {
          console.warn(`⚠️  Error parsing transcript for conversation ${conversation.id}:`, error.message);
          // Continue with other conversations
        }
      }

      if (!allTranscriptItems || allTranscriptItems.length === 0) {
        throw new ValidationError('No valid transcript items found. Please complete a call session with conversation.');
      }

      console.log(`Found ${allTranscriptItems.length} total transcript items for user ${userId}. Generating report...`);

      // Generate report using Groq API with all transcript items
      // generateReportWithGroq expects transcriptData and wraps it in { transcript: ... }
      const groqResponse = await this.generateReportWithGroq(allTranscriptItems);

      if (!groqResponse.success) {
        console.error(`[Reports] Groq API error for user ${userId}:`, groqResponse.error);
        throw new ValidationError(groqResponse.error || 'Failed to generate report from Groq API');
      }

      // Validate and structure the Groq response
      const validatedReport = this.validateAndStructureReport(groqResponse.data);

      return {
        report: validatedReport,
        cached: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        conversation_count: conversations.length,
        transcript_items_count: allTranscriptItems.length,
      };
    } finally {
      client.release();
    }
  },

  /**
   * Validate and structure the Groq report response
   * Ensures the response matches expected structure
   */
  validateAndStructureReport(groqData) {
    // Expected structure based on dailyReportPrompt
    const defaultStructure = {
      overall_score: null,
      fluency: {
        score: null,
        analysis: null,
        strengths: [],
        areas_for_improvement: [],
      },
      vocabulary: {
        score: null,
        analysis: null,
        strengths: [],
        areas_for_improvement: [],
        word_usage_examples: [],
      },
      grammar: {
        score: null,
        analysis: null,
        strengths: [],
        areas_for_improvement: [],
        error_patterns: [],
      },
      discourse: {
        score: null,
        analysis: null,
        strengths: [],
        areas_for_improvement: [],
      },
      recommendations: [],
      next_steps: [],
    };

    // If groqData is already an object, merge with defaults
    if (typeof groqData === 'object' && groqData !== null) {
      return {
        ...defaultStructure,
        ...groqData,
        // Ensure nested objects are properly structured
        fluency: {
          ...defaultStructure.fluency,
          ...(groqData.fluency || {}),
        },
        vocabulary: {
          ...defaultStructure.vocabulary,
          ...(groqData.vocabulary || {}),
        },
        grammar: {
          ...defaultStructure.grammar,
          ...(groqData.grammar || {}),
        },
        discourse: {
          ...defaultStructure.discourse,
          ...(groqData.discourse || {}),
        },
      };
    }

    // If it's a string, try to parse it
    if (typeof groqData === 'string') {
      try {
        const parsed = JSON.parse(groqData);
        return this.validateAndStructureReport(parsed);
      } catch (error) {
        console.warn('⚠️  Could not parse Groq response as JSON, returning default structure');
        return defaultStructure;
      }
    }

    // Fallback to default structure
    console.warn('⚠️  Unexpected Groq response format, returning default structure');
    return defaultStructure;
  },
  // ============ POSTMAN-ALIGNED METHODS ============

  /**
   * Get or return cached daily report, auto-generate if not found or invalid
   */
  async getDailyReport(userId, date) {
    const client = await db.pool.connect();
    try {
      // Normalize to YYYY-MM-DD string
      const reportDate = date || new Date().toISOString().split('T')[0];

      // Try to fetch cached report
      const existingReport = await client.query(
        `SELECT * FROM daily_reports WHERE user_id = $1 AND report_date = $2`,
        [userId, reportDate]
      );

      if (existingReport.rows.length > 0) {
        const reportData = existingReport.rows[0].report_data;
        
        // Validate cached report structure
        if (reportData && 
            typeof reportData === 'object' && 
            reportData.fluency && 
            reportData.vocabulary && 
            reportData.grammar && 
            reportData.discourse) {
          console.log(`📊 Returning cached daily report for user ${userId} on ${reportDate}`);
          return {
            report: reportData,
            cached: true,
            created_at: existingReport.rows[0].created_at,
            updated_at: existingReport.rows[0].updated_at,
          };
        }
        // If cached report is invalid, fall through to generate
        console.log(`⚠️  Cached report invalid, regenerating for user ${userId} on ${reportDate}`);
      }

      // No valid cached report found - generate new one
      console.log(`🔄 Generating daily report for user ${userId} on ${reportDate}`);
      return await this.generateDailyReport(userId, reportDate);
    } finally {
      client.release();
    }
  },

  /**
   * Generate and save daily report
   */
  async generateDailyReport(userId, date = null) {
    const client = await db.pool.connect();
    try {
      const reportDate = date || new Date().toISOString().split('T')[0];

      console.log(`🔄 Generating daily report for user ${userId} on ${reportDate}`);

      // Check if report already exists
      const existingReport = await client.query(
        `SELECT * FROM daily_reports WHERE user_id = $1 AND report_date = $2`,
        [userId, reportDate]
      );

      if (existingReport.rows.length > 0) {
        console.log(`📊 Returning existing cached report for user ${userId} on ${reportDate}`);
        return {
          report: existingReport.rows[0].report_data,
          cached: true,
          created_at: existingReport.rows[0].created_at,
          updated_at: existingReport.rows[0].updated_at,
        };
      }

      // Fetch conversations for the specified date
      const startTime = new Date(`${reportDate}T00:00:00Z`);
      const endTime = new Date(`${reportDate}T23:59:59.999Z`);

      const conversationsResult = await client.query(
        `SELECT id, room_name, user_id, timestamp, transcript 
         FROM conversations 
         WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
         ORDER BY timestamp ASC`,
        [userId, startTime, endTime]
      );

      const conversations = conversationsResult.rows;

      if (!conversations || conversations.length === 0) {
        console.warn(`[Reports] No conversations found for user ${userId} on ${reportDate}. Returning empty report.`);

        // Return and cache a default / empty report instead of failing hard
        const emptyReport = this.validateAndStructureReport({});
        const saveResult = await client.query(
          `INSERT INTO daily_reports (user_id, report_date, report_data)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, report_date) DO UPDATE 
           SET report_data = EXCLUDED.report_data, updated_at = NOW()
           RETURNING created_at, updated_at`,
          [userId, reportDate, JSON.stringify(emptyReport)]
        );

        return {
          report: emptyReport,
          cached: false,
          created_at: saveResult.rows[0].created_at,
          updated_at: saveResult.rows[0].updated_at,
        };
      }

      // Parse transcript items from conversations
      const transcriptItems = conversations
        .map((item) => {
          try {
            const parsed = JSON.parse(item.transcript);
            return parsed.items || [];
          } catch (error) {
            console.error('Error parsing transcript item:', error);
            return [];
          }
        })
        .flat()
        .filter((item) => item.role === 'user' && item.content);

      if (!transcriptItems || transcriptItems.length === 0) {
        console.warn(`[Reports] No valid transcript items for user ${userId} on ${reportDate}. Returning empty report.`);

        // Return and cache a default / empty report instead of failing hard
        const emptyReport = this.validateAndStructureReport({});
        const saveResult = await client.query(
          `INSERT INTO daily_reports (user_id, report_date, report_data)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, report_date) DO UPDATE 
           SET report_data = EXCLUDED.report_data, updated_at = NOW()
           RETURNING created_at, updated_at`,
          [userId, reportDate, JSON.stringify(emptyReport)]
        );

        return {
          report: emptyReport,
          cached: false,
          created_at: saveResult.rows[0].created_at,
          updated_at: saveResult.rows[0].updated_at,
        };
      }

      console.log(`Found ${transcriptItems.length} transcript items for user ${userId} on ${reportDate}. Generating report...`);

      // Generate new report using Groq API
      const groqResponse = await this.generateReportWithGroq(transcriptItems);

      if (!groqResponse.success) {
        throw new ValidationError(groqResponse.error || 'Failed to generate report');
      }

      // Validate and structure the Groq response (same as call report)
      const validatedReport = this.validateAndStructureReport(groqResponse.data);

      // Save the validated report to database
      const saveResult = await client.query(
        `INSERT INTO daily_reports (user_id, report_date, report_data)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, report_date) DO UPDATE 
         SET report_data = EXCLUDED.report_data, updated_at = NOW()
         RETURNING created_at, updated_at`,
        [userId, reportDate, JSON.stringify(validatedReport)]
      );

      console.log(`✅ Daily report saved for user ${userId} on ${reportDate}`);

      return {
        report: validatedReport,
        cached: false,
        created_at: saveResult.rows[0].created_at,
        updated_at: saveResult.rows[0].updated_at,
      };
    } finally {
      client.release();
    }
  },

  /**
   * Generate report using Groq API
   */
  async generateReportWithGroq(transcriptData) {
    try {
      // Log transcript data size for debugging
      const transcriptSize = JSON.stringify(transcriptData).length;
      console.log(`[Reports] Sending ${transcriptData.length} transcript items to Groq (${transcriptSize} bytes)`);
      
      // Ensure transcriptData is an array
      if (!Array.isArray(transcriptData)) {
        console.error('[Reports] transcriptData is not an array:', typeof transcriptData);
        return { success: false, error: 'Invalid transcript format: expected array' };
      }
      
      // Check if transcript is empty
      if (transcriptData.length === 0) {
        return { success: false, error: 'No transcript items to analyze' };
      }
      
      const payload = { transcript: transcriptData };
      const data = await llmService.run('dailyReport', payload);
      return { success: true, data };
    } catch (error) {
      // Log full error details
      console.error('[Reports] LLM Daily Report Error:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      // Extract more detailed error message
      const errorMessage = error.response?.data?.error?.message || 
                          error.response?.data?.message ||
                          error.message || 
                          'AI analysis failed';
      
      return { success: false, error: errorMessage };
    }
  },

};

module.exports = reportsService;
