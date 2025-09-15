// src/modules/reports/controller.js
// Reports request handlers

const { 
  fetchReport,
  createReport,
  createReportWithAttempts
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Get or generate daily report for a user
const getReport = async (req, res) => {
  try {
    const { userId, date } = req.params;
    
    // Validate inputs
    if (!userId || !date) {
      return res.status(400).json(errorResponse('User ID and date are required'));
    }

    const result = await fetchReport(userId, date);
    
    if (result) {
      return res.json(successResponse({
        report: result.report_data,
        cached: true,
        created_at: result.created_at,
        updated_at: result.updated_at
      }, 'Returning cached daily report'));
    }

    // If no cached report, we need to generate one
    return res.json(errorResponse('No cached report found. Please generate a new report.', false));

  } catch (error) {
    console.error('Error getting daily report:', error);
    res.status(500).json(errorResponse(error, 'Unable to retrieve daily report at this time. Please try again later.'));
  }
};

// Generate and save daily report
const generateReport = async (req, res) => {
  try {
    const { userId, date, transcriptData } = req.body;
    
    // Validate inputs
    if (!userId || !date || !transcriptData) {
      return res.status(400).json(errorResponse('User ID, date, and transcript data are required'));
    }

    const result = await createReport(userId, date, transcriptData);
    
    res.json(successResponse({
      report: result.report,
      cached: result.cached,
      created_at: result.created_at,
      updated_at: result.updated_at
    }, 'Daily report generated and saved successfully'));

  } catch (error) {
    console.error('Error generating daily report:', error);
    res.status(500).json(errorResponse(error, 'Unable to generate daily report at this time. Please try again later.'));
  }
};

// Generate report with attempts logic
const generateReportWithAttempts = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await createReportWithAttempts(userId);
    
    res.json(successResponse({
      data: result.data,
      attempts: result.attempts
    }, 'Report generated successfully'));

  } catch (error) {
    console.error('Error generating report with attempts:', error);
    res.status(500).json(errorResponse(error.message || 'Failed to generate report'));
  }
};

module.exports = {
  getReport,
  generateReport,
  generateReportWithAttempts
};