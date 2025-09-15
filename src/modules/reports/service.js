// src/modules/reports/service.js
// Reports business logic

const { 
  getDailyReport,
  saveDailyReport
} = require('../../core/db/client');
const { generateReport } = require('../../core/ai');

const fetchReport = async (userId, date) => {
  if (!userId || !date) {
    throw new Error('User ID and date are required');
  }
  
  return await getDailyReport(userId, date);
};

const createReport = async (userId, date, transcriptData) => {
  if (!userId || !date || !transcriptData) {
    throw new Error('User ID, date, and transcript data are required');
  }
  
  // Check if report already exists
  const existingReport = await getDailyReport(userId, date);
  
  if (existingReport) {
    console.log(`📊 Returning existing cached report for user ${userId} on ${date}`);
    return {
      report: existingReport.report_data,
      cached: true,
      created_at: existingReport.created_at,
      updated_at: existingReport.updated_at
    };
  }

  // Generate new report using Groq API
  console.log(`🔄 Generating new daily report for user ${userId} on ${date}`);
  
  const groqResponse = await generateReport(transcriptData);
  
  if (!groqResponse.success) {
    throw new Error(groqResponse.error || 'Failed to generate report');
  }

  // Save the generated report to database
  const savedReport = await saveDailyReport(userId, date, groqResponse.data);
  
  console.log(`✅ Daily report saved for user ${userId} on ${date}`);

  return {
    report: groqResponse.data,
    cached: false,
    created_at: savedReport.created_at,
    updated_at: savedReport.updated_at
  };
};

// Generate a report with attempts logic
const createReportWithAttempts = async (userId) => {
  try {
    const maxAttempts = 8;
    const attemptInterval = 5000; // 5 seconds between attempts
    let attempts = 0;
    let success = false;
    let result = null;

    // Get latest conversations (not just today's)
    // This would typically be implemented with a database call
    // For now, we'll simulate this
    const conversations = await getLatestConversations(userId, 10);
    
    if (!conversations || conversations.length === 0) {
      throw new Error('No conversations found for user');
    }

    // Parse transcript items
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
      throw new Error('No valid transcript items found for user');
    }

    const attemptGeneration = async () => {
      try {
        attempts++;
        console.log(`Report generation attempt ${attempts}/${maxAttempts} for user ${userId}`);

        // Always wait for the full attempt cycle before calling API
        if (attempts < maxAttempts) {
          console.log(`Data validation successful on attempt ${attempts}, but waiting for full attempt cycle. Will retry.`);
          return false;
        }

        console.log(`Final attempt ${attempts} reached. Calling Groq API...`);

        // Generate report using AI service
        const groqResponse = await generateReport(transcriptItems);
        
        if (!groqResponse.success) {
          throw new Error(groqResponse.error || 'Failed to generate report');
        }

        result = groqResponse.data;
        success = true;
        return true;

      } catch (error) {
        console.error(`Report generation attempt ${attempts} failed:`, error);
        return false;
      }
    };

    // Try immediately first
    await attemptGeneration();

    // If not successful, retry with intervals
    while (!success && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, attemptInterval));
      await attemptGeneration();
    }

    if (success && result) {
      return {
        success: true,
        data: result,
        attempts: attempts
      };
    } else {
      throw new Error(`Failed to generate report after ${attempts} attempts. Please try again later.`);
    }

  } catch (error) {
    console.error('Error in generate-report-with-attempts:', error);
    throw new Error(error.message || 'Failed to generate report');
  }
};

// Helper function to get latest conversations (this would be implemented in the repo layer)
const getLatestConversations = async (userId, limit) => {
  // This is a placeholder - in a real implementation, this would query the database
  return [];
};

module.exports = {
  fetchReport,
  createReport,
  createReportWithAttempts
};